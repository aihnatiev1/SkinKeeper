import 'dart:developer' as dev;

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import '../../../core/api_client.dart';
import '../../../core/theme.dart';

/// Result returned when the user successfully logs in via WebView.
class SteamWebViewResult {
  final String steamLoginSecure;
  final String? sessionId;
  final String? refreshToken;

  const SteamWebViewResult({
    required this.steamLoginSecure,
    this.sessionId,
    this.refreshToken,
  });
}

/// Full-screen WebView that loads Steam login and extracts cookies after login.
///
/// Returns [SteamWebViewResult] on success, null on dismiss.
class SteamWebViewLogin extends StatefulWidget {
  const SteamWebViewLogin({super.key});

  @override
  State<SteamWebViewLogin> createState() => _SteamWebViewLoginState();
}

class _SteamWebViewLoginState extends State<SteamWebViewLogin> {
  bool _loading = true;
  bool _extracting = false;
  String _title = 'Sign in to Steam';

  final _cookieManager = CookieManager.instance();

  @override
  void initState() {
    super.initState();
    // Clear old Steam cookies so user always gets a fresh login
    _clearSteamCookies();
  }

  Future<void> _clearSteamCookies() async {
    await _cookieManager.deleteCookies(
      url: WebUri('https://steamcommunity.com'),
    );
    await _cookieManager.deleteCookies(
      url: WebUri('https://store.steampowered.com'),
    );
    await _cookieManager.deleteCookies(
      url: WebUri('https://login.steampowered.com'),
    );
  }

  Future<void> _onPageFinished(InAppWebViewController controller, WebUri? url) async {
    setState(() => _loading = false);

    if (url == null) return;
    final urlStr = url.toString();

    // Update title based on where user is
    if (urlStr.contains('/login/home') || urlStr.contains('/login?')) {
      setState(() => _title = 'Sign in to Steam');
    } else if ((urlStr.contains('steamcommunity.com') || urlStr.contains('steampowered.com')) &&
        !urlStr.contains('/login/') && !urlStr.contains('/login?')) {
      // User has logged in — we're on a non-login Steam page
      setState(() => _title = 'Connecting...');
      await _tryExtractCookies();
    }
  }

  Future<void> _tryExtractCookies() async {
    if (_extracting) return;
    _extracting = true;

    try {
      // Small delay to let cookies sync to the cookie store
      await Future.delayed(const Duration(milliseconds: 800));

      // Extract steamLoginSecure from steamcommunity.com
      final slsCookie = await _cookieManager.getCookie(
        url: WebUri('https://steamcommunity.com'),
        name: 'steamLoginSecure',
      );

      if (slsCookie == null || slsCookie.value.toString().isEmpty) {
        dev.log('steamLoginSecure cookie not found, retrying...', name: 'WebView');
        // Retry after a longer delay
        await Future.delayed(const Duration(milliseconds: 1500));
        final retry = await _cookieManager.getCookie(
          url: WebUri('https://steamcommunity.com'),
          name: 'steamLoginSecure',
        );
        if (retry == null || retry.value.toString().isEmpty) {
          dev.log('steamLoginSecure cookie still not found', name: 'WebView');
          if (mounted) {
            _extracting = false;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Could not extract session. Please try again.'),
                backgroundColor: AppTheme.loss,
              ),
            );
          }
          return;
        }
        await _processSuccessfulLogin(retry.value.toString());
        return;
      }

      await _processSuccessfulLogin(slsCookie.value.toString());
    } catch (e) {
      dev.log('Cookie extraction error: $e', name: 'WebView');
      _extracting = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Login failed: ${friendlyError(e)}'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    }
  }

  Future<void> _processSuccessfulLogin(String steamLoginSecure) async {
    dev.log('Got steamLoginSecure: len=${steamLoginSecure.length}', name: 'WebView');

    // Try to get sessionid
    String? sessionId;
    final sidCookie = await _cookieManager.getCookie(
      url: WebUri('https://steamcommunity.com'),
      name: 'sessionid',
    );
    if (sidCookie != null) {
      sessionId = sidCookie.value.toString();
    }

    // Steam sets the refresh JWT as `steamRefresh_{steamid64}`; the steamid64
    // is per-user, so we can't hardcode the cookie name. Enumerate all cookies
    // on both login.steampowered.com and steamcommunity.com and pick the first
    // one that matches the prefix.
    String? refreshToken;
    try {
      final candidates = <String>[];
      for (final host in const [
        'https://login.steampowered.com',
        'https://steamcommunity.com',
      ]) {
        final cookies = await _cookieManager.getCookies(url: WebUri(host));
        for (final c in cookies) {
          if (c.name.startsWith('steamRefresh_')) {
            final val = c.value.toString();
            if (val.isNotEmpty) candidates.add(val);
          }
        }
      }
      if (candidates.isNotEmpty) {
        refreshToken = candidates.first;
        dev.log('Got refresh token: len=${refreshToken.length}', name: 'WebView');
      }
    } catch (e) {
      dev.log('Could not get refresh cookie (non-fatal): $e', name: 'WebView');
    }

    dev.log(
      'WebView login success: sls_len=${steamLoginSecure.length}, sid=${sessionId != null}, refresh=${refreshToken != null}',
      name: 'WebView',
    );

    if (!mounted) return;
    Navigator.of(context).pop(SteamWebViewResult(
      steamLoginSecure: steamLoginSecure,
      sessionId: sessionId,
      refreshToken: refreshToken,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        backgroundColor: AppTheme.bg,
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(null),
        ),
        title: Text(
          _title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.w600,
          ),
        ),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          InAppWebView(
            initialUrlRequest: URLRequest(
              url: WebUri('https://steamcommunity.com/login/home/'),
            ),
            initialSettings: InAppWebViewSettings(
              // Use desktop user agent to avoid mobile Steam login quirks
              userAgent:
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              javaScriptEnabled: true,
              domStorageEnabled: true,
              thirdPartyCookiesEnabled: true,
              // Allow mixed content for Steam's login flow
              mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
            ),
            onLoadStop: _onPageFinished,
            onLoadStart: (controller, url) {
              setState(() => _loading = true);
            },
          ),
          // Loading indicator
          if (_loading)
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(
                backgroundColor: Colors.transparent,
                color: AppTheme.primary,
              ),
            ),
          // Extracting overlay
          if (_extracting)
            Container(
              color: AppTheme.bg.withValues(alpha: 0.9),
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: AppTheme.primary),
                    SizedBox(height: 16),
                    Text(
                      'Connecting your account...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
