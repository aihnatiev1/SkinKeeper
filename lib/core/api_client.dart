import 'dart:async';
import 'dart:developer' as dev;
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'analytics_service.dart';
import 'constants.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

/// Stream that fires when any API call returns SESSION_EXPIRED.
final sessionExpiredController = StreamController<void>.broadcast();

/// Stream that fires when any API call returns TOKEN_EXPIRED (JWT invalid).
final tokenExpiredController = StreamController<void>.broadcast();

/// Returns true if the error is a 401 requiring Steam session reauth.
bool isSessionExpired(dynamic e) {
  if (e is DioException && e.response?.statusCode == 401) {
    final data = e.response?.data;
    if (data is Map && data['code'] == 'SESSION_EXPIRED') return true;
  }
  return false;
}

/// Returns true if the error is a 401 due to an expired/invalid JWT.
bool isTokenExpired(dynamic e) {
  if (e is DioException && e.response?.statusCode == 401) {
    final data = e.response?.data;
    if (data is Map && data['code'] == 'TOKEN_EXPIRED') return true;
  }
  return false;
}

/// Extract a user-friendly message from any error (Dio or otherwise).
/// Messages include actionable next steps — users should know what to try
/// next, not just that something failed.
String friendlyError(dynamic e) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map) {
      final code = data['code'] as String?;
      // Known backend codes → actionable guidance
      switch (code) {
        case 'TOKEN_EXPIRED':
          return 'Session expired — please log in again';
        case 'STEAM_UNAVAILABLE':
          return 'Steam is down — try again in a few minutes';
        case 'RATE_LIMITED':
          return 'Too many requests — wait a minute and retry';
        case 'INVENTORY_PRIVATE':
          return 'Inventory is private — change it to public in Steam settings';
        case 'ACCOUNT_LIMITED':
          return 'Steam account limited — enable mobile authenticator in Steam';
      }
      final msg = data['error'] ?? data['message'];
      if (msg is String && msg.isNotEmpty) return msg;
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Connection timed out — check your internet and retry';
      case DioExceptionType.connectionError:
        return 'No internet connection — check Wi-Fi or mobile data';
      default:
        final code = e.response?.statusCode;
        if (code == 401 || code == 403) {
          return 'Access denied — try logging in again';
        }
        if (code == 500 || code == 502 || code == 503) {
          return 'Our server is having a moment — retry in a bit';
        }
        if (code != null) return 'Request failed ($code) — please retry';
        return 'Connection error — check your internet';
    }
  }
  return 'Something went wrong — try again or restart the app';
}

class ApiClient {
  late final Dio _dio;
  final _storage = const FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
    mOptions: MacOsOptions(useDataProtectionKeyChain: true),
  );
  bool _refreshing = false;

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(LogInterceptor(
      requestBody: false,
      responseBody: true,
      logPrint: (o) => dev.log(o.toString(), name: 'API'),
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'jwt_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onResponse: (response, handler) async {
        final newToken = response.headers.value('X-New-Token');
        if (newToken != null) {
          await _storage.write(key: 'jwt_token', value: newToken);
          dev.log('Token proactively refreshed via X-New-Token', name: 'ApiClient');
        }
        handler.next(response);
      },
      onError: (error, handler) async {
        final path = error.requestOptions.path;
        if (isTokenExpired(error)) {
          if (!path.startsWith('/auth')) {
            // Try to refresh token before giving up
            final refreshed = await _tryRefreshToken();
            if (refreshed) {
              // Retry the original request with new token
              try {
                final token = await _storage.read(key: 'jwt_token');
                final opts = error.requestOptions;
                opts.headers['Authorization'] = 'Bearer $token';
                final response = await _dio.fetch(opts);
                return handler.resolve(response);
              } catch (_) {
                // Refresh worked but retry failed — still expired
              }
            }
            tokenExpiredController.add(null);
          }
        } else if (isSessionExpired(error)) {
          // Don't fire for session/auth paths (already on reauth screen)
          if (!path.startsWith('/session') &&
              !path.startsWith('/auth')) {
            sessionExpiredController.add(null);
          }
        }
        // Record server errors (5xx) as non-fatal for crash reporting
        final statusCode = error.response?.statusCode ?? 0;
        if (statusCode >= 500) {
          Analytics.recordError(
            error,
            error.stackTrace,
            reason: 'API $statusCode: ${error.requestOptions.method} $path',
          );
        }
        handler.next(error);
      },
    ));
  }

  Future<bool> _tryRefreshToken() async {
    if (_refreshing) return false;
    _refreshing = true;
    try {
      final oldToken = await _storage.read(key: 'jwt_token');
      if (oldToken == null) return false;

      final response = await Dio().post(
        '${AppConstants.apiBaseUrl}/auth/refresh',
        options: Options(headers: {'Authorization': 'Bearer $oldToken'}),
      );

      final newToken = response.data['token'] as String?;
      if (newToken != null) {
        await _storage.write(key: 'jwt_token', value: newToken);
        dev.log('Token refreshed via /auth/refresh', name: 'ApiClient');
        return true;
      }
      return false;
    } catch (e) {
      dev.log('Token refresh failed: $e', name: 'ApiClient');
      return false;
    } finally {
      _refreshing = false;
    }
  }

  Future<void> saveToken(String token) async {
    try {
      await _storage.write(key: 'jwt_token', value: token);
    } on PlatformException catch (e) {
      // -25299 = errSecDuplicateItem: item exists, delete and retry
      if (e.message?.contains('-25299') == true ||
          e.message?.contains('already exists') == true) {
        await _storage.delete(key: 'jwt_token');
        await _storage.write(key: 'jwt_token', value: token);
      } else {
        rethrow;
      }
    }
  }

  Future<void> clearToken() async {
    await _storage.delete(key: 'jwt_token');
  }

  Future<bool> hasToken() async {
    final token = await _storage.read(key: 'jwt_token');
    return token != null;
  }

  Future<Response> get(String path,
      {Map<String, dynamic>? queryParameters}) {
    return _dio.get(path, queryParameters: queryParameters);
  }

  Future<Response> post(String path,
      {dynamic data,
      Map<String, dynamic>? queryParameters,
      Duration? receiveTimeout}) {
    return _dio.post(path,
        data: data,
        queryParameters: queryParameters,
        options: receiveTimeout != null
            ? Options(receiveTimeout: receiveTimeout)
            : null);
  }

  Future<Response> put(String path, {dynamic data}) {
    return _dio.put(path, data: data);
  }

  Future<Response> delete(String path, {dynamic data}) {
    return _dio.delete(path, data: data);
  }

  Future<Response> patch(String path, {dynamic data}) {
    return _dio.patch(path, data: data);
  }
}
