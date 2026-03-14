import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';
import 'package:skin_keeper/core/api_client.dart';

/// Mock ApiClient for provider tests.
class MockApiClient extends Mock implements ApiClient {}

/// Mock Dio Response builder helper.
Response<dynamic> mockResponse(dynamic data, {int statusCode = 200}) {
  return Response(
    data: data,
    statusCode: statusCode,
    requestOptions: RequestOptions(path: ''),
  );
}

/// Helper to set up MockApiClient with common GET/POST stubs.
void stubApiGet(MockApiClient api, String path, dynamic responseData) {
  when(() => api.get(
        path,
        queryParameters: any(named: 'queryParameters'),
      )).thenAnswer((_) async => mockResponse(responseData));
}

void stubApiPost(MockApiClient api, String path, dynamic responseData) {
  when(() => api.post(
        path,
        data: any(named: 'data'),
        queryParameters: any(named: 'queryParameters'),
        receiveTimeout: any(named: 'receiveTimeout'),
      )).thenAnswer((_) async => mockResponse(responseData));
}

void stubApiPut(MockApiClient api, String path, dynamic responseData) {
  when(() => api.put(
        path,
        data: any(named: 'data'),
      )).thenAnswer((_) async => mockResponse(responseData));
}

void stubApiDelete(MockApiClient api, String path, dynamic responseData) {
  when(() => api.delete(
        path,
        data: any(named: 'data'),
      )).thenAnswer((_) async => mockResponse(responseData));
}
