import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:skin_keeper/core/api_client.dart';

void main() {
  group('ApiClient SESSION_EXPIRED handling', () {
    test('isSessionExpired returns true for 401 with SESSION_EXPIRED code', () {
      final dioError = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 401,
          data: {'error': 'Steam session expired', 'code': 'SESSION_EXPIRED'},
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isSessionExpired(dioError), isTrue);
    });

    test('isSessionExpired returns false for 401 without SESSION_EXPIRED code', () {
      final dioError = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 401,
          data: {'error': 'Not authenticated', 'code': 'AUTH_ERROR'},
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isSessionExpired(dioError), isFalse);
    });

    test('isSessionExpired returns false for 500 errors', () {
      final dioError = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 500,
          data: {'error': 'Internal server error'},
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isSessionExpired(dioError), isFalse);
    });

    test('isSessionExpired returns false for non-DioException errors', () {
      expect(isSessionExpired(Exception('generic error')), isFalse);
      expect(isSessionExpired(null), isFalse);
    });
  });
}
