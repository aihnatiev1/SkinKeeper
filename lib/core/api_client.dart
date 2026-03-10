import 'dart:async';
import 'dart:developer' as dev;
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'constants.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

/// Stream that fires when any API call returns SESSION_EXPIRED.
final sessionExpiredController = StreamController<void>.broadcast();

/// Returns true if the error is a SESSION_EXPIRED 401.
bool isSessionExpired(dynamic e) {
  if (e is DioException && e.response?.statusCode == 401) {
    final data = e.response?.data;
    if (data is Map && data['code'] == 'SESSION_EXPIRED') return true;
  }
  return false;
}

/// Extract a user-friendly message from any error (Dio or otherwise).
String friendlyError(dynamic e) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map) {
      final msg = data['error'] ?? data['message'];
      if (msg is String && msg.isNotEmpty) return msg;
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Connection timed out';
      case DioExceptionType.connectionError:
        return 'No internet connection';
      default:
        final code = e.response?.statusCode;
        if (code != null) return 'Request failed ($code)';
        return 'Connection error';
    }
  }
  return 'Something went wrong';
}

class ApiClient {
  late final Dio _dio;
  final _storage = const FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
    mOptions: MacOsOptions(useDataProtectionKeyChain: true),
  );

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
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
      onError: (error, handler) {
        if (isSessionExpired(error)) {
          final path = error.requestOptions.path;
          // Don't fire for session/auth paths (already on reauth screen)
          if (!path.startsWith('/session') &&
              !path.startsWith('/auth')) {
            sessionExpiredController.add(null);
          }
        }
        handler.next(error);
      },
    ));
  }

  Future<void> saveToken(String token) async {
    await _storage.write(key: 'jwt_token', value: token);
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
