import 'dart:convert';
import 'dart:async';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import 'package:pdfrx/pdfrx.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'kayato_toast.dart';

final nameInputFormatters = <TextInputFormatter>[
  FilteringTextInputFormatter.allow(RegExp(r'[A-Za-zÀ-ÖØ-öø-ÿĀ-ž .-]')),
  TextInputFormatter.withFunction((oldValue, newValue) {
    final text = newValue.text.replaceAllMapped(
      RegExp(r'(^|[ .-])([A-Za-zÀ-ÖØ-öø-ÿĀ-ž])'),
      (match) => '${match.group(1)}${match.group(2)!.toUpperCase()}',
    );
    return newValue.copyWith(text: text);
  }),
  LengthLimitingTextInputFormatter(40),
];

const kayaRuby = Color(0xFF70000E);
const kayaInk = Color(0xFF2C2929);
const kayaPearl = Color(0xFFF5F4F2);
const kayaRaised = Color(0xFFFCFBFA);
const kayaBorder = Color(0xFFD0C9C5);
const kayaMuted = Color(0xFF655D5D);
const kayaSuccess = Color(0xFF2A6F62);
const kayaWarning = Color(0xFFA45100);
const kayaWebUrl = String.fromEnvironment(
  'WEB_URL',
  defaultValue: 'https://kaya-to.vercel.app',
);

bool emailSyntaxIsValid(String value) => RegExp(
  r'^[^\s@]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$',
).hasMatch(value.trim());

const supportedCurrencies = [
  'PHP',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'SGD',
  'AUD',
  'CAD',
];
const supportedTimezones = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Hong_Kong',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];
String formatMoney(num value, String currency) {
  final decimals = currency == 'JPY' ? 0 : 2;
  return '$currency ${value.toStringAsFixed(decimals)}';
}

String formatDateOnly(dynamic value) {
  final match = RegExp(
    r'^\d{4}-\d{2}-\d{2}',
  ).firstMatch(value?.toString() ?? '');
  return match?.group(0) ?? 'No due date';
}

void main() => runApp(const KayaToApp());

class PushService {
  static const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static StreamSubscription<String>? _tokenRefresh;
  static StreamSubscription<RemoteMessage>? _foregroundMessages;
  static bool get configured =>
      apiKey.isNotEmpty &&
      appId.isNotEmpty &&
      messagingSenderId.isNotEmpty &&
      projectId.isNotEmpty;
  static String get platform =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  static Future<bool> _initialize() async {
    if (kIsWeb || !configured) return false;
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: apiKey,
          appId: appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
        ),
      );
    }
    return true;
  }

  static Future<void> enable(ApiClient api) async {
    if (!await _initialize()) {
      throw Exception('Firebase mobile push is not configured in this build.');
    }
    final permission = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (permission.authorizationStatus != AuthorizationStatus.authorized &&
        permission.authorizationStatus != AuthorizationStatus.provisional) {
      throw Exception('Notification permission was not granted.');
    }
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) {
      throw Exception('This device could not create a notification token.');
    }
    await api.request(
      '/push/mobile',
      method: 'POST',
      body: {'token': token, 'platform': platform},
    );
    await _tokenRefresh?.cancel();
    _tokenRefresh = FirebaseMessaging.instance.onTokenRefresh.listen((
      nextToken,
    ) {
      api
          .request(
            '/push/mobile',
            method: 'POST',
            body: {'token': nextToken, 'platform': platform},
          )
          .catchError((_) => null);
    });
    await _foregroundMessages?.cancel();
    _foregroundMessages = FirebaseMessaging.onMessage.listen((message) {
      kayaToast.success(
        message.notification?.title ?? 'KayaTo',
        description:
            message.notification?.body ?? 'You have a new notification.',
      );
    });
  }

  static Future<void> disable(ApiClient api) async {
    if (!await _initialize()) return;
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) {
      await api.request(
        '/push/mobile',
        method: 'DELETE',
        body: {'token': token},
      );
    }
    await FirebaseMessaging.instance.deleteToken();
    await _tokenRefresh?.cancel();
    _tokenRefresh = null;
  }
}

class ApiClient {
  static String get baseUrl =>
      const String.fromEnvironment('API_URL', defaultValue: '').isNotEmpty
      ? const String.fromEnvironment('API_URL')
      : (kIsWeb || defaultTargetPlatform != TargetPlatform.android
            ? 'http://localhost:5000/api'
            : 'http://10.0.2.2:5000/api');
  String? token;
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    request.headers.addAll({
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    });
    request.body = body == null ? '' : jsonEncode(body);
    final streamed = await request.send();
    final text = await streamed.stream.bytesToString();
    final data = text.isEmpty ? null : jsonDecode(text);
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      throw Exception(data?['message'] ?? 'Request failed');
    }
    return data;
  }
}

class KayaToApp extends StatefulWidget {
  const KayaToApp({super.key});
  @override
  State<KayaToApp> createState() => _KayaToAppState();
}

class _KayaToAppState extends State<KayaToApp> with WidgetsBindingObserver {
  final api = ApiClient();
  final navigatorKey = GlobalKey<NavigatorState>();
  ThemeMode mode = ThemeMode.system;
  Map<String, dynamic>? user;
  bool loading = true;
  Timer? sessionTimer;
  DateTime lastActivity = DateTime.now();
  DateTime lastPersistedActivity = DateTime.fromMillisecondsSinceEpoch(0);
  bool warningVisible = false;
  static const sessionLength = Duration(minutes: 30);
  static const warningLength = Duration(minutes: 1);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _restore();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    sessionTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkSession();
  }

  Future<void> _recordActivity() async {
    if (user == null) return;
    lastActivity = DateTime.now();
    warningVisible = false;
    if (lastActivity.difference(lastPersistedActivity) <
        const Duration(seconds: 5)) {
      return;
    }
    lastPersistedActivity = lastActivity;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('last_activity', lastActivity.millisecondsSinceEpoch);
  }

  void _startSessionTimer() {
    sessionTimer?.cancel();
    sessionTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _checkSession(),
    );
  }

  Future<void> _checkSession() async {
    if (user == null) return;
    final idle = DateTime.now().difference(lastActivity);
    if (idle >= sessionLength) {
      warningVisible = false;
      await logout(sessionExpired: true);
      return;
    }
    if (idle >= sessionLength - warningLength && !warningVisible && mounted) {
      warningVisible = true;
      final context = navigatorKey.currentContext;
      if (context == null) return;
      final stay = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Session expiring soon'),
          content: const Text(
            'You will be signed out after 30 minutes of inactivity.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Log out'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Stay signed in'),
            ),
          ],
        ),
      );
      warningVisible = false;
      if (stay == true) {
        await _recordActivity();
      } else if (user != null) {
        await logout();
      }
    }
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    api.token = prefs.getString('token');
    final savedActivity = prefs.getInt('last_activity');
    if (savedActivity != null) {
      lastActivity = DateTime.fromMillisecondsSinceEpoch(savedActivity);
    }
    if (api.token != null &&
        DateTime.now().difference(lastActivity) >= sessionLength) {
      await prefs.remove('token');
      await prefs.remove('last_activity');
      api.token = null;
    }
    if (api.token != null) {
      try {
        user = await api.request('/auth/me');
        if (user?['notificationChannels']?['mobilePush'] == true) {
          unawaited(PushService.enable(api).catchError((_) {}));
        }
      } catch (_) {
        await prefs.remove('token');
        api.token = null;
      }
    }
    if (user != null) _startSessionTimer();
    if (mounted) setState(() => loading = false);
  }

  Future<void> signedIn(Map<String, dynamic> data) async {
    api.token = data['token'];
    user = data['user'];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', api.token!);
    lastActivity = DateTime.now();
    await prefs.setInt('last_activity', lastActivity.millisecondsSinceEpoch);
    _startSessionTimer();
    setState(() {});
    if (user?['notificationChannels']?['mobilePush'] == true) {
      unawaited(PushService.enable(api).catchError((_) {}));
    }
  }

  Future<void> logout({bool sessionExpired = false}) async {
    final prefs = await SharedPreferences.getInstance();
    if (user?['notificationChannels']?['mobilePush'] == true) {
      await PushService.disable(api).catchError((_) {});
    }
    await prefs.remove('token');
    await prefs.remove('last_activity');
    sessionTimer?.cancel();
    api.token = null;
    if (mounted) setState(() => user = null);
    if (sessionExpired) {
      kayaToast.info(
        'Session expired',
        description: 'Sign in again to continue.',
      );
    }
  }

  void updateUser(Map<String, dynamic> nextUser) =>
      setState(() => user = nextUser);

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: navigatorKey,
    title: 'KayaTo',
    debugShowCheckedModeBanner: false,
    themeMode: mode,
    theme: _theme(false),
    darkTheme: _theme(true),
    builder: (context, child) => DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: Theme.of(context).brightness == Brightness.dark
              ? const [Color(0xFF030303), Color(0xFF100D0E)]
              : const [kayaPearl, Color(0xFFEBE7E4)],
        ),
      ),
      child: KayaToaster(
        child: Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: (_) => unawaited(_recordActivity()),
          onPointerMove: (_) => unawaited(_recordActivity()),
          child: child!,
        ),
      ),
    ),
    home: loading
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : user == null
        ? AuthScreen(
            api: api,
            onSuccess: signedIn,
            onTheme: () => setState(
              () => mode = mode == ThemeMode.dark
                  ? ThemeMode.light
                  : ThemeMode.dark,
            ),
          )
        : HomeScreen(
            api: api,
            user: user!,
            onLogout: logout,
            onUserUpdated: updateUser,
            onTheme: () => setState(
              () => mode = mode == ThemeMode.dark
                  ? ThemeMode.light
                  : ThemeMode.dark,
            ),
          ),
  );
}

ThemeData _theme(bool dark) {
  final baseScheme = ColorScheme.fromSeed(
    seedColor: kayaRuby,
    brightness: dark ? Brightness.dark : Brightness.light,
  );
  final scheme = baseScheme.copyWith(
    primary: dark ? const Color(0xFFD45A68) : kayaRuby,
    onPrimary: kayaPearl,
    secondary: dark ? const Color(0xFFC3B79D) : kayaInk,
    onSecondary: dark ? const Color(0xFF171515) : kayaPearl,
    tertiary: dark ? const Color(0xFF69B8A8) : kayaSuccess,
    surface: dark ? const Color(0xFF171515) : kayaRaised,
    surfaceContainerLowest: dark ? const Color(0xFF171515) : kayaRaised,
    surfaceContainerLow: dark
        ? const Color(0xFF242020)
        : const Color(0xFFF0ECE9),
    surfaceContainer: dark ? const Color(0xFF2C2929) : const Color(0xFFE9E5E2),
    surfaceContainerHigh: dark
        ? const Color(0xFF353131)
        : const Color(0xFFE2DDDA),
    onSurface: dark ? kayaPearl : kayaInk,
    onSurfaceVariant: dark ? const Color(0xFFDCD7D4) : kayaMuted,
    outline: dark ? const Color(0xFF5B5555) : kayaBorder,
    outlineVariant: dark ? const Color(0xFF4B4646) : kayaBorder,
    error: dark ? const Color(0xFFE26F7D) : kayaRuby,
  );
  final theme = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Colors.transparent,
    canvasColor: scheme.surface,
    dividerColor: scheme.outlineVariant,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      backgroundColor: scheme.surface.withValues(alpha: 0.96),
      foregroundColor: scheme.onSurface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: TextStyle(
        color: scheme.onSurface,
        fontSize: 18,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.35,
      ),
      shape: Border(bottom: BorderSide(color: scheme.outlineVariant)),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: scheme.surface,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surface,
      labelStyle: TextStyle(color: scheme.onSurfaceVariant),
      floatingLabelStyle: TextStyle(
        color: scheme.primary,
        fontWeight: FontWeight.w700,
      ),
      hintStyle: TextStyle(color: scheme.onSurfaceVariant),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.error),
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 52),
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        disabledBackgroundColor: scheme.surfaceContainerHigh,
        disabledForegroundColor: scheme.onSurfaceVariant,
        elevation: 0,
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        foregroundColor: scheme.onSurface,
        side: BorderSide(color: scheme.outlineVariant),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: scheme.primary,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      elevation: 2,
      highlightElevation: 1,
      backgroundColor: scheme.primary,
      foregroundColor: scheme.onPrimary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size.square(44),
        foregroundColor: scheme.onSurfaceVariant,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: scheme.onSurfaceVariant,
      textColor: scheme.onSurface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      minVerticalPadding: 12,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    chipTheme: ChipThemeData(
      side: BorderSide(color: scheme.outlineVariant),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(7)),
      labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: scheme.primary,
      linearTrackColor: scheme.surfaceContainerHigh,
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 70,
      elevation: 0,
      backgroundColor: scheme.surface.withValues(alpha: 0.98),
      surfaceTintColor: Colors.transparent,
      indicatorColor: dark ? const Color(0xFF35181B) : const Color(0xFFF1E2E3),
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected)
              ? scheme.primary
              : scheme.onSurfaceVariant,
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w800
              : FontWeight.w600,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? scheme.primary
              : scheme.onSurfaceVariant,
          size: 22,
        ),
      ),
    ),
  );
  return theme.copyWith(
    textTheme: theme.textTheme.copyWith(
      headlineLarge: theme.textTheme.headlineLarge?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -1.1,
        height: 1.12,
      ),
      headlineMedium: theme.textTheme.headlineMedium?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
        height: 1.15,
      ),
      headlineSmall: theme.textTheme.headlineSmall?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.55,
        height: 1.18,
      ),
      titleLarge: theme.textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.35,
      ),
      titleMedium: theme.textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w700,
      ),
      bodyLarge: theme.textTheme.bodyLarge?.copyWith(height: 1.5),
      bodyMedium: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
      labelLarge: theme.textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({
    required this.api,
    required this.onSuccess,
    required this.onTheme,
    super.key,
  });
  final ApiClient api;
  final ValueChanged<Map<String, dynamic>> onSuccess;
  final VoidCallback onTheme;
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final formKey = GlobalKey<FormState>();
  final firstName = TextEditingController(),
      lastName = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController(),
      confirmPassword = TextEditingController(),
      code = TextEditingController();
  final otpControllers = List.generate(6, (_) => TextEditingController());
  final otpFocusNodes = List.generate(6, (_) => FocusNode());
  bool register = false,
      awaitingCode = false,
      busy = false,
      hidden = true,
      confirmHidden = true,
      passwordFocused = false,
      emailChecking = false;
  String? error, emailDomainError;
  int emailValidationSequence = 0;
  bool get strongPassword =>
      password.text.length >= 8 &&
      RegExp(r'[A-Z]').hasMatch(password.text) &&
      RegExp(r'[a-z]').hasMatch(password.text) &&
      RegExp(r'\d').hasMatch(password.text) &&
      RegExp(r'[^A-Za-z0-9]').hasMatch(password.text);
  void syncOtpCode() {
    code.text = otpControllers.map((controller) => controller.text).join();
  }

  void clearOtp() {
    for (final controller in otpControllers) {
      controller.clear();
    }
    code.clear();
  }

  void enterOtpDigits(int startIndex, String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      otpControllers[startIndex].clear();
      syncOtpCode();
      if (startIndex > 0) otpFocusNodes[startIndex - 1].requestFocus();
      return;
    }
    final available = digits.substring(
      0,
      digits.length.clamp(0, 6 - startIndex).toInt(),
    );
    for (var offset = 0; offset < available.length; offset++) {
      final controller = otpControllers[startIndex + offset];
      controller.value = TextEditingValue(
        text: available[offset],
        selection: const TextSelection.collapsed(offset: 1),
      );
    }
    syncOtpCode();
    otpFocusNodes[(startIndex + available.length).clamp(0, 5).toInt()]
        .requestFocus();
  }

  @override
  void dispose() {
    for (final controller in [
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      code,
      ...otpControllers,
    ]) {
      controller.dispose();
    }
    for (final focusNode in otpFocusNodes) {
      focusNode.dispose();
    }
    super.dispose();
  }

  Future<bool> validateEmailDomain({bool showEmptyError = false}) async {
    if (!register || awaitingCode) return true;
    final value = email.text.trim().toLowerCase();
    if (value.isEmpty) {
      if (showEmptyError && mounted) {
        setState(() => emailDomainError = 'Enter your email address');
      }
      return false;
    }
    if (!emailSyntaxIsValid(value)) {
      if (mounted) {
        setState(() => emailDomainError = 'Enter a complete email address');
      }
      return false;
    }
    final sequence = ++emailValidationSequence;
    setState(() {
      emailChecking = true;
      emailDomainError = null;
    });
    try {
      await widget.api.request(
        '/auth/register/check-email-domain',
        method: 'POST',
        body: {'email': value},
      );
      if (!mounted || sequence != emailValidationSequence) return false;
      setState(() => emailDomainError = null);
      return true;
    } catch (exception) {
      if (!mounted || sequence != emailValidationSequence) return false;
      setState(
        () => emailDomainError = exception.toString().replaceFirst(
          'Exception: ',
          '',
        ),
      );
      return false;
    } finally {
      if (mounted && sequence == emailValidationSequence) {
        setState(() => emailChecking = false);
      }
    }
  }

  Future<void> submit() async {
    if (!formKey.currentState!.validate()) return;
    if (register && !awaitingCode) {
      if (!await validateEmailDomain(showEmptyError: true)) return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (register && !awaitingCode) {
        await widget.api.request(
          '/auth/register/request-otp',
          method: 'POST',
          body: {'email': email.text},
        );
        clearOtp();
        setState(() => awaitingCode = true);
        kayaToast.success(
          'Verification code sent',
          description: 'Check ${email.text}. The code expires in 10 minutes.',
        );
      } else {
        final data = await widget.api.request(
          register ? '/auth/register/verify' : '/auth/login',
          method: 'POST',
          body: {
            if (register) 'firstName': firstName.text,
            if (register) 'lastName': lastName.text,
            'email': email.text,
            'password': password.text,
            if (register) 'primaryUsage': 'both',
            if (register) 'code': code.text,
          },
        );
        widget.onSuccess(data);
      }
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: Theme.of(context).brightness == Brightness.dark
                    ? const [
                        Color(0xFF080707),
                        Color(0xFF160D10),
                        Color(0xFF09090F),
                      ]
                    : const [
                        Color(0xFFFDFBFC),
                        Color(0xFFF5EDF0),
                        Color(0xFFF1F3FB),
                      ],
                stops: const [0, .52, 1],
              ),
            ),
          ),
        ),
        const Positioned(
          top: -110,
          right: -100,
          child: AuthGlow(color: Color(0xFF9B1023), size: 300),
        ),
        const Positioned(
          bottom: -120,
          left: -100,
          child: AuthGlow(color: Color(0xFF7257D8), size: 280),
        ),
        SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 10, 14, 6),
                child: Row(
                  children: [
                    const KayaBrandLockup(),
                    const Spacer(),
                    IconButton(
                      onPressed: widget.onTheme,
                      tooltip: 'Switch theme',
                      icon: const Icon(Icons.contrast_rounded),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 430),
                      child: Card(
                        elevation: 18,
                        shadowColor: Colors.black.withValues(alpha: .18),
                        color: Theme.of(
                          context,
                        ).colorScheme.surface.withValues(alpha: .94),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: BorderSide(
                            color: Theme.of(
                              context,
                            ).colorScheme.outlineVariant.withValues(alpha: .82),
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
                          child: Form(
                            key: formKey,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Align(
                                  alignment: Alignment.center,
                                  child: KayaBrandIcon(),
                                ),
                                const SizedBox(height: 18),
                                Text(
                                  register
                                      ? awaitingCode
                                            ? 'Verify your email'
                                            : 'Create your KayaTo account'
                                      : 'Continue to KayaTo',
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium
                                      ?.copyWith(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 30,
                                        letterSpacing: -1.2,
                                      ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  register
                                      ? awaitingCode
                                            ? 'Enter the 6-digit code sent to ${email.text}.'
                                            : 'Organize personal and team work in one place.'
                                      : 'Sign in to keep your projects, plans, and conversations moving.',
                                  style: TextStyle(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                    height: 1.5,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 24),
                                if (error != null) ErrorBox(error!),
                                if (register && awaitingCode) ...[
                                  const Text(
                                    'Verification code *',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: List.generate(6, (index) {
                                      return Expanded(
                                        child: Padding(
                                          padding: EdgeInsets.only(
                                            right: index == 5 ? 0 : 6,
                                          ),
                                          child: Semantics(
                                            label:
                                                'Verification code digit ${index + 1} of 6',
                                            textField: true,
                                            child: TextFormField(
                                              controller: otpControllers[index],
                                              focusNode: otpFocusNodes[index],
                                              autofocus: index == 0,
                                              keyboardType:
                                                  TextInputType.number,
                                              textInputAction: index == 5
                                                  ? TextInputAction.done
                                                  : TextInputAction.next,
                                              autofillHints: index == 0
                                                  ? const [
                                                      AutofillHints.oneTimeCode,
                                                    ]
                                                  : null,
                                              inputFormatters: [
                                                FilteringTextInputFormatter
                                                    .digitsOnly,
                                              ],
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                fontSize: 20,
                                                fontWeight: FontWeight.w800,
                                              ),
                                              decoration: const InputDecoration(
                                                counterText: '',
                                                contentPadding:
                                                    EdgeInsets.symmetric(
                                                      vertical: 16,
                                                    ),
                                              ),
                                              validator: index == 0
                                                  ? (_) =>
                                                        !RegExp(
                                                          r'^\d{6}$',
                                                        ).hasMatch(code.text)
                                                        ? 'Enter all 6 digits'
                                                        : null
                                                  : null,
                                              onChanged: (value) =>
                                                  enterOtpDigits(index, value),
                                              onFieldSubmitted: index == 5
                                                  ? (_) => submit()
                                                  : (_) =>
                                                        otpFocusNodes[index + 1]
                                                            .requestFocus(),
                                            ),
                                          ),
                                        ),
                                      );
                                    }),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'Enter the six digits from your KayaTo email.',
                                    style: Theme.of(context).textTheme.bodySmall
                                        ?.copyWith(
                                          color: Theme.of(
                                            context,
                                          ).colorScheme.onSurfaceVariant,
                                        ),
                                  ),
                                  const SizedBox(height: 8),
                                  TextButton(
                                    onPressed: busy
                                        ? null
                                        : () => setState(() {
                                            awaitingCode = false;
                                            clearOtp();
                                            error = null;
                                          }),
                                    child: const Text(
                                      'Change email or account details',
                                    ),
                                  ),
                                ] else ...[
                                  if (register) ...[
                                    Row(
                                      children: [
                                        Expanded(
                                          child: TextFormField(
                                            controller: firstName,
                                            textInputAction:
                                                TextInputAction.next,
                                            autofillHints: const [
                                              AutofillHints.givenName,
                                            ],
                                            textCapitalization:
                                                TextCapitalization.words,
                                            inputFormatters:
                                                nameInputFormatters,
                                            decoration: const InputDecoration(
                                              labelText: 'First name *',
                                            ),
                                            validator: (v) =>
                                                (v ?? '').trim().length < 2
                                                ? 'Enter first name'
                                                : null,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: TextFormField(
                                            controller: lastName,
                                            textInputAction:
                                                TextInputAction.next,
                                            autofillHints: const [
                                              AutofillHints.familyName,
                                            ],
                                            textCapitalization:
                                                TextCapitalization.words,
                                            inputFormatters:
                                                nameInputFormatters,
                                            decoration: const InputDecoration(
                                              labelText: 'Last name *',
                                            ),
                                            validator: (v) =>
                                                (v ?? '').trim().length < 2
                                                ? 'Enter last name'
                                                : null,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Align(
                                      alignment: Alignment.centerLeft,
                                      child: Text(
                                        'Letters, spaces, periods, and hyphens only.',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                              color: Theme.of(
                                                context,
                                              ).colorScheme.onSurfaceVariant,
                                            ),
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                  ],
                                  Focus(
                                    onFocusChange: (focused) {
                                      if (!focused &&
                                          register &&
                                          !awaitingCode) {
                                        validateEmailDomain();
                                      }
                                    },
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        const AuthFieldLabel('Email address'),
                                        const SizedBox(height: 8),
                                        TextFormField(
                                          controller: email,
                                          keyboardType:
                                              TextInputType.emailAddress,
                                          textInputAction: TextInputAction.next,
                                          autofillHints: const [
                                            AutofillHints.email,
                                          ],
                                          decoration: InputDecoration(
                                            hintText: 'name@example.com',
                                            errorText: emailDomainError,
                                            suffixIcon: emailChecking
                                                ? const Padding(
                                                    padding: EdgeInsets.all(14),
                                                    child: SizedBox.square(
                                                      dimension: 18,
                                                      child:
                                                          CircularProgressIndicator(
                                                            strokeWidth: 2,
                                                          ),
                                                    ),
                                                  )
                                                : null,
                                          ),
                                          onChanged: (_) => setState(() {
                                            emailValidationSequence += 1;
                                            emailDomainError = null;
                                            emailChecking = false;
                                          }),
                                          validator: (v) =>
                                              !emailSyntaxIsValid(
                                                (v ?? '').trim(),
                                              )
                                              ? 'Enter a complete email address'
                                              : null,
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  Focus(
                                    onFocusChange: (focused) => setState(
                                      () => passwordFocused = focused,
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        const AuthFieldLabel('Password'),
                                        const SizedBox(height: 8),
                                        TextFormField(
                                          controller: password,
                                          obscureText: hidden,
                                          autofillHints: [
                                            register
                                                ? AutofillHints.newPassword
                                                : AutofillHints.password,
                                          ],
                                          decoration: InputDecoration(
                                            hintText: 'Enter your password',
                                            suffixIcon: IconButton(
                                              onPressed: () => setState(
                                                () => hidden = !hidden,
                                              ),
                                              tooltip: hidden
                                                  ? 'Show password'
                                                  : 'Hide password',
                                              icon: Icon(
                                                hidden
                                                    ? Icons.visibility_outlined
                                                    : Icons
                                                          .visibility_off_outlined,
                                              ),
                                            ),
                                          ),
                                          onChanged: register
                                              ? (_) => setState(() {})
                                              : null,
                                          validator: (v) =>
                                              register && !strongPassword
                                              ? 'Complete all password requirements'
                                              : (v ?? '').length < 8
                                              ? 'Use at least 8 characters'
                                              : null,
                                          onFieldSubmitted: register
                                              ? null
                                              : (_) => submit(),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (register && passwordFocused) ...[
                                    const SizedBox(height: 10),
                                    Wrap(
                                      spacing: 12,
                                      runSpacing: 8,
                                      children: [
                                        PasswordRule(
                                          label: 'At least 8 characters',
                                          met: password.text.length >= 8,
                                        ),
                                        PasswordRule(
                                          label: 'One uppercase letter',
                                          met: RegExp(
                                            r'[A-Z]',
                                          ).hasMatch(password.text),
                                        ),
                                        PasswordRule(
                                          label: 'One lowercase letter',
                                          met: RegExp(
                                            r'[a-z]',
                                          ).hasMatch(password.text),
                                        ),
                                        PasswordRule(
                                          label: 'One number',
                                          met: RegExp(
                                            r'\d',
                                          ).hasMatch(password.text),
                                        ),
                                        PasswordRule(
                                          label: 'One symbol',
                                          met: RegExp(
                                            r'[^A-Za-z0-9]',
                                          ).hasMatch(password.text),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    TextFormField(
                                      controller: confirmPassword,
                                      obscureText: confirmHidden,
                                      autofillHints: const [
                                        AutofillHints.newPassword,
                                      ],
                                      decoration: InputDecoration(
                                        labelText: 'Confirm password *',
                                        suffixIcon: IconButton(
                                          onPressed: () => setState(
                                            () =>
                                                confirmHidden = !confirmHidden,
                                          ),
                                          tooltip: confirmHidden
                                              ? 'Show confirmed password'
                                              : 'Hide confirmed password',
                                          icon: Icon(
                                            confirmHidden
                                                ? Icons.visibility_outlined
                                                : Icons.visibility_off_outlined,
                                          ),
                                        ),
                                      ),
                                      validator: (v) => v != password.text
                                          ? 'Passwords do not match'
                                          : null,
                                      onFieldSubmitted: (_) => submit(),
                                    ),
                                  ],
                                ],
                                const SizedBox(height: 12),
                                if (!register && !awaitingCode)
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: TextButton(
                                      onPressed: busy
                                          ? null
                                          : () => Navigator.push(
                                              context,
                                              MaterialPageRoute(
                                                builder: (_) =>
                                                    PasswordResetScreen(
                                                      api: widget.api,
                                                      initialEmail: email.text,
                                                    ),
                                              ),
                                            ),
                                      child: const Text('Forgot password?'),
                                    ),
                                  ),
                                const SizedBox(height: 4),
                                FilledButton(
                                  onPressed: busy || emailChecking
                                      ? null
                                      : submit,
                                  child: Text(
                                    busy
                                        ? awaitingCode
                                              ? 'Verifying...'
                                              : 'Please wait...'
                                        : register
                                        ? awaitingCode
                                              ? 'Verify and create account'
                                              : 'Send verification code'
                                        : 'Log in',
                                  ),
                                ),
                                TextButton(
                                  onPressed: busy
                                      ? null
                                      : () => setState(() {
                                          register = !register;
                                          awaitingCode = false;
                                          passwordFocused = false;
                                          emailChecking = false;
                                          emailDomainError = null;
                                          emailValidationSequence += 1;
                                          clearOtp();
                                          error = null;
                                        }),
                                  child: Text(
                                    register
                                        ? 'Already have an account? Log in'
                                        : 'New to KayaTo? Create an account',
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class AuthGlow extends StatelessWidget {
  const AuthGlow({required this.color, required this.size, super.key});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: SizedBox.square(
      dimension: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color.withValues(alpha: .22), color.withValues(alpha: 0)],
          ),
        ),
      ),
    ),
  );
}

class AuthFieldLabel extends StatelessWidget {
  const AuthFieldLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: Theme.of(context).textTheme.labelMedium?.copyWith(
      color: Theme.of(context).colorScheme.onSurface,
      fontWeight: FontWeight.w700,
    ),
  );
}

class PasswordRule extends StatelessWidget {
  const PasswordRule({required this.label, required this.met, super.key});
  final String label;
  final bool met;
  @override
  Widget build(BuildContext context) => Semantics(
    label: '$label: ${met ? 'met' : 'not met'}',
    child: SizedBox(
      width: 176,
      child: Row(
        children: [
          Icon(
            met ? Icons.check_circle_rounded : Icons.circle_outlined,
            size: 16,
            color: met
                ? Theme.of(context).colorScheme.tertiary
                : Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: met
                    ? Theme.of(context).colorScheme.tertiary
                    : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.api,
    required this.user,
    required this.onLogout,
    required this.onUserUpdated,
    required this.onTheme,
    super.key,
  });
  final ApiClient api;
  final Map<String, dynamic> user;
  final VoidCallback onLogout, onTheme;
  final ValueChanged<Map<String, dynamic>> onUserUpdated;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int index = 0;

  String get initials {
    final parts = widget.user['displayName']
        .toString()
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'KT';
    return parts.take(2).map((part) => part[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      DashboardTab(api: widget.api, user: widget.user),
      TasksTab(api: widget.api),
      PlannerTab(api: widget.api),
      ChatTab(api: widget.api, user: widget.user),
      MoreTab(
        api: widget.api,
        user: widget.user,
        onLogout: widget.onLogout,
        onTheme: widget.onTheme,
        onUserUpdated: widget.onUserUpdated,
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: 20,
        title: const KayaBrandLockup(),
        actions: [
          IconButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => NotificationCenterPage(api: widget.api),
              ),
            ),
            tooltip: 'Notifications',
            icon: const Icon(Icons.notifications_outlined),
          ),
          const SizedBox(width: 2),
          Tooltip(
            message: 'Open profile and settings',
            child: InkWell(
              onTap: () => setState(() => index = 4),
              borderRadius: BorderRadius.circular(22),
              child: CircleAvatar(
                radius: 17,
                backgroundColor: Theme.of(
                  context,
                ).colorScheme.surfaceContainerHigh,
                foregroundColor: Theme.of(context).colorScheme.primary,
                child: Text(
                  initials,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
        ),
        child: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (value) => setState(() => index = value),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.space_dashboard_outlined),
              selectedIcon: Icon(Icons.space_dashboard_rounded),
              label: 'Home',
            ),
            NavigationDestination(
              icon: Icon(Icons.checklist_outlined),
              selectedIcon: Icon(Icons.checklist_rounded),
              label: 'Tasks',
            ),
            NavigationDestination(
              icon: Icon(Icons.auto_awesome_outlined),
              selectedIcon: Icon(Icons.auto_awesome_rounded),
              label: 'Planner',
            ),
            NavigationDestination(
              icon: Icon(Icons.chat_bubble_outline_rounded),
              selectedIcon: Icon(Icons.chat_bubble_rounded),
              label: 'Chat',
            ),
            NavigationDestination(
              icon: Icon(Icons.grid_view_outlined),
              selectedIcon: Icon(Icons.grid_view_rounded),
              label: 'More',
            ),
          ],
        ),
      ),
    );
  }
}

class DashboardTab extends StatefulWidget {
  const DashboardTab({required this.api, required this.user, super.key});
  final ApiClient api;
  final Map<String, dynamic> user;
  @override
  State<DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<DashboardTab> {
  Map<String, dynamic>? data;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      data = await widget.api.request('/dashboard');
    } catch (e) {
      error = e.toString();
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: load,
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        PageHeader(
          title:
              'Good day, ${widget.user['displayName'].toString().split(' ').first}.',
          subtitle: 'Here is what needs your attention today.',
          icon: Icons.space_dashboard_rounded,
        ),
        const SizedBox(height: 24),
        if (error != null) ErrorBox(error!),
        if (data == null && error == null)
          const LoadingPanel(label: 'Loading your workspace...')
        else if (data != null) ...[
          Row(
            children: [
              Metric(
                label: 'Completed',
                value: '${data!['metrics']['completed']}',
                icon: Icons.check_circle_outline,
                color: kayaSuccess,
              ),
              const SizedBox(width: 12),
              Metric(
                label: 'In progress',
                value: '${data!['metrics']['inProgress']}',
                icon: Icons.timelapse_rounded,
                color: kayaRuby,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Metric(
                label: 'Needs attention',
                value: '${data!['metrics']['needsAttention']}',
                icon: Icons.priority_high_rounded,
                color: kayaWarning,
              ),
              const SizedBox(width: 12),
              Metric(
                label: 'Total tasks',
                value: '${data!['metrics']['total']}',
                icon: Icons.inventory_2_outlined,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ],
          ),
          const SizedBox(height: 24),
          SectionCard(
            title: 'Priority list',
            subtitle: 'Your nearest and most important work',
            children: [
              for (final task in data!['tasks'])
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(vertical: 4),
                  leading: StatusIcon(status: task['status']?.toString()),
                  title: Text(
                    task['title'],
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text('${task['project']} · ${task['status']}'),
                  trailing: PriorityChip(task['priority']),
                ),
              if ((data!['tasks'] as List).isEmpty)
                const EmptyCopy('No tasks yet. Create one from the Tasks tab.'),
            ],
          ),
        ],
      ],
    ),
  );
}

class Metric extends StatelessWidget {
  const Metric({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    super.key,
  });
  final String label, value;
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.11),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(icon, size: 19, color: color),
                ),
                const Spacer(),
                Text(
                  value,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class TasksTab extends StatefulWidget {
  const TasksTab({required this.api, super.key});
  final ApiClient api;
  @override
  State<TasksTab> createState() => _TasksTabState();
}

class _TasksTabState extends State<TasksTab> {
  List tasks = [];
  bool loading = true;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      tasks = await widget.api.request('/tasks');
      error = null;
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> add() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const TaskSheet(),
    );
    if (result == null) return;
    try {
      await widget.api.request('/tasks', method: 'POST', body: result);
      kayaToast.success('Task created');
      load();
    } catch (e) {
      kayaToast.error('Could not create task', description: e.toString());
    }
  }

  Future<void> edit(Map task) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => TaskSheet(task: Map<String, dynamic>.from(task)),
    );
    if (result == null) return;
    try {
      final targetStatus =
          result.remove('status')?.toString() ?? task['status'].toString();
      var currentStatus = task['status'].toString();
      await widget.api.request(
        '/tasks/${task['_id']}',
        method: 'PATCH',
        body: result,
      );
      const statuses = ['todo', 'in-progress', 'review', 'done'];
      while (currentStatus != targetStatus) {
        final currentIndex = statuses.indexOf(currentStatus);
        final targetIndex = statuses.indexOf(targetStatus);
        currentStatus =
            statuses[currentIndex + (targetIndex > currentIndex ? 1 : -1)];
        await widget.api.request(
          '/tasks/${task['_id']}',
          method: 'PATCH',
          body: {'status': currentStatus},
        );
      }
      kayaToast.success('Task updated');
      await load();
    } catch (e) {
      kayaToast.error('Could not update task', description: e.toString());
    }
  }

  Future<void> remove(Map task) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete task?'),
        content: Text('“${task['title']}” will be permanently deleted.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.api.request('/tasks/${task['_id']}', method: 'DELETE');
      await load();
    } catch (e) {
      kayaToast.error('Could not delete task', description: e.toString());
    }
  }

  Future<void> done(Map task) async {
    try {
      const statuses = ['todo', 'in-progress', 'review', 'done'];
      var index = statuses.indexOf(task['status']);
      while (index < statuses.length - 1) {
        index += 1;
        await widget.api.request(
          '/tasks/${task['_id']}',
          method: 'PATCH',
          body: {'status': statuses[index]},
        );
      }
      await load();
    } catch (e) {
      kayaToast.error('Could not complete task', description: e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.transparent,
    floatingActionButton: FloatingActionButton.extended(
      onPressed: add,
      icon: const Icon(Icons.add),
      label: const Text('Create task'),
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
        children: [
          const PageHeader(
            title: 'My tasks',
            subtitle: 'Plan, prioritize, and finish your work.',
            icon: Icons.checklist_rounded,
          ),
          const SizedBox(height: 24),
          if (error != null) ErrorBox(error!),
          if (loading)
            const LoadingPanel(label: 'Loading tasks...')
          else if (tasks.isEmpty)
            const EmptyCopy('No tasks yet. Create your first task.')
          else
            for (final task in tasks)
              Card(
                child: ListTile(
                  onTap: () => edit(task),
                  minVerticalPadding: 14,
                  title: Text(
                    task['title'],
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text('${task['project']} · ${task['status']}'),
                  leading: IconButton(
                    tooltip: 'Mark complete',
                    onPressed: task['status'] == 'done'
                        ? null
                        : () => done(task),
                    icon: Icon(
                      task['status'] == 'done'
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                    ),
                    style: IconButton.styleFrom(
                      foregroundColor: task['status'] == 'done'
                          ? kayaSuccess
                          : Theme.of(context).colorScheme.primary,
                      backgroundColor: task['status'] == 'done'
                          ? kayaSuccess.withValues(alpha: 0.1)
                          : Theme.of(
                              context,
                            ).colorScheme.primary.withValues(alpha: 0.08),
                    ),
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (value) =>
                        value == 'edit' ? edit(task) : remove(task),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'edit', child: Text('Edit task')),
                      PopupMenuItem(
                        value: 'delete',
                        child: Text('Delete task'),
                      ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    ),
  );
}

class BillsTab extends StatefulWidget {
  const BillsTab({required this.api, required this.user, super.key});
  final ApiClient api;
  final Map<String, dynamic> user;
  @override
  State<BillsTab> createState() => _BillsTabState();
}

class _BillsTabState extends State<BillsTab> {
  List bills = [];
  bool loading = true;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      bills = await widget.api.request('/bills');
      error = null;
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> add() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BillSheet(currency: widget.user['currency'] ?? 'PHP'),
    );
    if (result == null) return;
    try {
      await widget.api.request('/bills', method: 'POST', body: result);
      kayaToast.success('Bill reminder added');
      load();
    } catch (e) {
      kayaToast.error('Could not add reminder', description: e.toString());
    }
  }

  Future<void> edit(Map bill) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BillSheet(
        currency: widget.user['currency'] ?? 'PHP',
        bill: Map<String, dynamic>.from(bill),
      ),
    );
    if (result == null) return;
    try {
      await widget.api.request(
        '/bills/${bill['_id']}',
        method: 'PATCH',
        body: result,
      );
      kayaToast.success('Bill updated');
      await load();
    } catch (e) {
      kayaToast.error('Could not update bill', description: e.toString());
    }
  }

  Future<void> setPaid(Map bill) async {
    try {
      await widget.api.request(
        '/bills/${bill['_id']}',
        method: 'PATCH',
        body: {'status': bill['status'] == 'paid' ? 'unpaid' : 'paid'},
      );
      await load();
    } catch (e) {
      kayaToast.error('Could not update bill', description: e.toString());
    }
  }

  Future<void> remove(Map bill) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete reminder?'),
        content: Text('“${bill['name']}” will be removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.api.request('/bills/${bill['_id']}', method: 'DELETE');
      await load();
    } catch (e) {
      kayaToast.error('Could not delete bill', description: e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.transparent,
    floatingActionButton: FloatingActionButton.extended(
      onPressed: add,
      icon: const Icon(Icons.add),
      label: const Text('Add bill'),
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
        children: [
          const PageHeader(
            title: 'Bills & reminders',
            subtitle: 'Keep payments visible and on schedule.',
            icon: Icons.receipt_long_rounded,
          ),
          const SizedBox(height: 24),
          if (error != null) ErrorBox(error!),
          if (loading)
            const LoadingPanel(label: 'Loading reminders...')
          else if (bills.isEmpty)
            const EmptyCopy('No reminders yet. Add your first bill.')
          else
            for (final bill in bills)
              Card(
                child: ListTile(
                  onTap: () => edit(bill),
                  minVerticalPadding: 14,
                  leading: IconButton(
                    onPressed: () => setPaid(bill),
                    tooltip: bill['status'] == 'paid'
                        ? 'Mark unpaid'
                        : 'Mark paid',
                    icon: Icon(
                      bill['status'] == 'paid'
                          ? Icons.check_circle
                          : Icons.receipt_long_outlined,
                    ),
                    style: IconButton.styleFrom(
                      foregroundColor: bill['status'] == 'paid'
                          ? kayaSuccess
                          : Theme.of(context).colorScheme.primary,
                      backgroundColor: bill['status'] == 'paid'
                          ? kayaSuccess.withValues(alpha: 0.1)
                          : Theme.of(
                              context,
                            ).colorScheme.primary.withValues(alpha: 0.08),
                    ),
                  ),
                  title: Text(
                    bill['name'],
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text('Due ${formatDateOnly(bill['dueDate'])}'),
                  trailing: PopupMenuButton<String>(
                    onSelected: (value) => value == 'edit'
                        ? edit(bill)
                        : value == 'paid'
                        ? setPaid(bill)
                        : remove(bill),
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                        value: 'edit',
                        child: Text('Edit reminder'),
                      ),
                      PopupMenuItem(
                        value: 'paid',
                        child: Text(
                          bill['status'] == 'paid'
                              ? 'Mark unpaid'
                              : 'Mark paid',
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Text('Delete reminder'),
                      ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    ),
  );
}

class PlannerTab extends StatefulWidget {
  const PlannerTab({required this.api, super.key});
  final ApiClient api;
  @override
  State<PlannerTab> createState() => _PlannerTabState();
}

class _PlannerTabState extends State<PlannerTab> {
  static const _maxFileBytes = 5 * 1024 * 1024;
  static const _maxSourceCharacters = 60000;
  static const _maxBriefCharacters = 5000;
  static const _allowedExtensions = [
    'pdf',
    'txt',
    'md',
    'markdown',
    'csv',
    'json',
  ];

  final brief = TextEditingController();
  List plan = [];
  bool busy = false;
  bool importing = false;
  String? error;
  String? importedFileName;
  int? importedFileBytes;
  String? importMessage;

  @override
  void dispose() {
    brief.dispose();
    super.dispose();
  }

  String _fileSize(int bytes) {
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / 1024).ceil()} KB';
  }

  String _cleanSource(String value) => value
      .replaceAll('\u0000', '')
      .replaceAll(RegExp(r'\r\n?'), '\n')
      .replaceAll(RegExp(r'[ \t]+'), ' ')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();

  Future<String> _extractPdfText(Uint8List bytes, String fileName) async {
    await pdfrxFlutterInitialize();
    final document = await PdfDocument.openData(
      bytes,
      sourceName: '$fileName-${DateTime.now().microsecondsSinceEpoch}',
      maxSizeToCacheOnMemory: _maxFileBytes,
    );
    try {
      final extracted = StringBuffer();
      for (final page in document.pages) {
        final pageText = await page.loadText();
        final text = pageText?.fullText.trim();
        if (text == null || text.isEmpty) continue;
        if (extracted.isNotEmpty) extracted.writeln('\n');
        extracted.write(text);
        if (extracted.length >= _maxSourceCharacters) break;
      }
      return extracted.toString();
    } finally {
      await document.dispose();
    }
  }

  Future<void> importFile() async {
    if (importing || busy) return;
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: _allowedExtensions,
    );
    if (file == null) return;

    setState(() {
      importing = true;
      error = null;
      importMessage = 'Reading ${file.name}...';
      importedFileName = file.name;
      importedFileBytes = null;
    });

    try {
      final length = file.lengthSync() ?? await file.length();
      if (length == null) throw Exception('Could not determine the file size.');
      if (length == 0) throw Exception('The selected file is empty.');
      if (length > _maxFileBytes) {
        throw Exception('Choose a file that is 5 MB or smaller.');
      }
      final extension = (file.extension ?? '').toLowerCase();
      if (!_allowedExtensions.contains(extension)) {
        throw Exception('This file type is not supported.');
      }

      final bytes = await file.readAsBytes();
      if (!mounted) return;
      setState(() {
        importedFileBytes = length;
        importMessage = extension == 'pdf'
            ? 'Extracting text from PDF...'
            : 'Reading document text...';
      });

      final rawText = extension == 'pdf'
          ? await _extractPdfText(bytes, file.name)
          : utf8.decode(bytes, allowMalformed: true);
      final cleaned = _cleanSource(rawText);
      if (cleaned.length < 20 ||
          RegExp(r'[A-Za-z0-9]').allMatches(cleaned).length < 10) {
        throw Exception(
          extension == 'pdf'
              ? 'No readable text was found. Scanned PDFs need OCR before upload.'
              : 'The file does not contain enough readable text.',
        );
      }

      if (!mounted) return;
      setState(() => importMessage = 'Creating a concise summary...');
      final source = cleaned.length > _maxSourceCharacters
          ? cleaned.substring(0, _maxSourceCharacters)
          : cleaned;
      final data = await widget.api.request(
        '/planner/summarize',
        method: 'POST',
        body: {'text': source},
      );
      final summary = (data['summary'] ?? '').toString().trim();
      if (summary.isEmpty) throw Exception('Could not summarize this file.');

      brief.text = summary.length > _maxBriefCharacters
          ? summary.substring(0, _maxBriefCharacters)
          : summary;
      if (!mounted) return;
      setState(() {
        plan = [];
        importMessage = 'Summary ready. Review or edit it before generating.';
      });
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        error = exception.toString().replaceFirst('Exception: ', '');
        importMessage = null;
        importedFileName = null;
        importedFileBytes = null;
      });
    } finally {
      if (mounted) setState(() => importing = false);
    }
  }

  void removeImportedFile() {
    setState(() {
      importedFileName = null;
      importedFileBytes = null;
      importMessage = null;
    });
  }

  Future<void> generate() async {
    if (brief.text.trim().length < 20) {
      setState(() => error = 'Add a little more detail to your project brief.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final data = await widget.api.request(
        '/planner/generate',
        method: 'POST',
        body: {'text': brief.text},
      );
      setState(() => plan = data['tasks']);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save() async {
    setState(() => busy = true);
    try {
      for (final task in plan) {
        await widget.api.request(
          '/tasks',
          method: 'POST',
          body: {
            ...Map<String, dynamic>.from(task),
            'project': 'Planner',
            'taskType': 'personal',
            'aiGenerated': true,
          },
        );
      }
      kayaToast.success('Plan added to your tasks');
    } catch (e) {
      kayaToast.error('Could not save plan', description: e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
    children: [
      const PageHeader(
        title: 'Project planner',
        subtitle: 'Turn a brief into a reviewable task breakdown.',
        icon: Icons.auto_awesome_rounded,
      ),
      const SizedBox(height: 24),
      _PlannerFileImport(
        fileName: importedFileName,
        fileSize: importedFileBytes == null
            ? null
            : _fileSize(importedFileBytes!),
        message: importMessage,
        loading: importing,
        onPick: importFile,
        onRemove: removeImportedFile,
      ),
      const SizedBox(height: 18),
      TextField(
        controller: brief,
        minLines: 6,
        maxLines: 10,
        maxLength: _maxBriefCharacters,
        decoration: const InputDecoration(
          labelText: 'Project brief',
          alignLabelWithHint: true,
          hintText:
              'Upload a file or describe requirements, outputs, and constraints.',
        ),
      ),
      const SizedBox(height: 14),
      if (error != null) ErrorBox(error!),
      FilledButton.icon(
        onPressed: busy || importing ? null : generate,
        icon: const Icon(Icons.auto_awesome_rounded),
        label: Text(busy ? 'Preparing...' : 'Generate plan'),
      ),
      if (plan.isNotEmpty) ...[
        const SizedBox(height: 20),
        SectionCard(
          title: 'Draft plan',
          subtitle: '${plan.length} tasks ready to review',
          children: [
            for (final task in plan)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.checklist_rounded),
                title: Text(
                  task['title'],
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${task['estimatedHours']} hours · ${task['priority']} priority',
                ),
              ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: busy ? null : save,
              child: const Text('Create tasks'),
            ),
          ],
        ),
      ],
    ],
  );
}

class _PlannerFileImport extends StatelessWidget {
  const _PlannerFileImport({
    required this.fileName,
    required this.fileSize,
    required this.message,
    required this.loading,
    required this.onPick,
    required this.onRemove,
  });

  final String? fileName;
  final String? fileSize;
  final String? message;
  final bool loading;
  final VoidCallback onPick;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final hasFile = fileName != null;
    final fileDetails = [fileSize, message].whereType<String>().join(' · ');
    return Semantics(
      button: !loading,
      label: hasFile
          ? 'Imported file $fileName'
          : 'Choose a project brief file',
      child: Material(
        color: hasFile
            ? colors.primary.withValues(alpha: 0.08)
            : colors.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: hasFile
                ? colors.primary.withValues(alpha: 0.7)
                : colors.outlineVariant,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: loading ? null : onPick,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: colors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  alignment: Alignment.center,
                  child: loading
                      ? SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: colors.primary,
                          ),
                        )
                      : Icon(
                          hasFile
                              ? Icons.description_rounded
                              : Icons.upload_file_rounded,
                          color: colors.primary,
                        ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hasFile ? fileName! : 'Upload project brief',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        hasFile
                            ? fileDetails
                            : 'PDF, TXT, Markdown, CSV, or JSON · Max 5 MB',
                        style: TextStyle(
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                if (hasFile && !loading)
                  IconButton(
                    tooltip: 'Remove file',
                    onPressed: onRemove,
                    icon: const Icon(Icons.close_rounded),
                  )
                else if (!loading)
                  Icon(
                    Icons.chevron_right_rounded,
                    color: colors.onSurfaceVariant,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class ChatTab extends StatefulWidget {
  const ChatTab({required this.api, required this.user, super.key});
  final ApiClient api;
  final Map<String, dynamic> user;
  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  List conversations = [], messages = [];
  Map? active;
  final text = TextEditingController();
  String? error;
  bool loading = true, conversationsOpen = false;
  @override
  void initState() {
    super.initState();
    loadConversations();
  }

  Future<void> loadConversations() async {
    try {
      final previousId = active?['_id'];
      conversations = await widget.api.request('/conversations');
      if (conversations.isNotEmpty) {
        active = conversations.cast<Map>().firstWhere(
          (item) => item['_id'] == previousId,
          orElse: () => conversations.first,
        );
        await loadMessages();
      } else {
        active = null;
        messages = [];
      }
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> manageFriends() async {
    if (mounted) setState(() => conversationsOpen = false);
    final conversation = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => FriendsPage(api: widget.api)),
    );
    await loadConversations();
    if (conversation != null && mounted) {
      setState(() => active = conversation);
      await loadMessages();
    }
  }

  String conversationLabel(Map item) {
    if (item['kind'] != 'direct') return '#${item['name']}';
    return otherParticipant(item)?['displayName']?.toString() ??
        'Direct message';
  }

  Map? otherParticipant(Map item) {
    final participants = item['participants'] as List? ?? const [];
    return participants
        .cast<Map>()
        .where(
          (person) =>
              '${person['_id'] ?? person['id']}' !=
              '${widget.user['id'] ?? widget.user['_id']}',
        )
        .firstOrNull;
  }

  String conversationSubtitle(Map item) {
    if (item['kind'] != 'direct') {
      return item['team']?['name']?.toString() ?? 'Team channel';
    }
    final person = otherParticipant(item);
    final username = person?['username']?.toString() ?? '';
    return username.isEmpty ? 'Direct message' : '@$username';
  }

  String conversationInitials(Map item) {
    final label = conversationLabel(item).replaceFirst('#', '').trim();
    return label
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();
  }

  Future<void> chooseConversation(Map item) async {
    if (active?['_id'] == item['_id']) {
      setState(() => conversationsOpen = false);
      return;
    }
    setState(() {
      active = item;
      messages = [];
      error = null;
      conversationsOpen = false;
    });
    try {
      await loadMessages();
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    }
  }

  Future<void> loadMessages() async {
    if (active == null) return;
    messages = await widget.api.request(
      '/conversations/${active!['_id']}/messages',
    );
    if (mounted) setState(() {});
  }

  Future<void> send() async {
    final content = text.text.trim();
    if (content.isEmpty || active == null) return;
    text.clear();
    try {
      final data = await widget.api.request(
        '/conversations/${active!['_id']}/messages',
        method: 'POST',
        body: {'content': content},
      );
      setState(
        () => messages = [
          ...messages,
          data['message'],
          if (data['aiMessage'] != null) data['aiMessage'],
        ],
      );
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  bool isOwnMessage(Map message) =>
      message['senderType'] != 'ai' &&
      '${message['sender']?['_id'] ?? message['sender']}' ==
          '${widget.user['id'] ?? widget.user['_id']}';

  Widget messageBubble(BuildContext context, Map message) {
    final own = isOwnMessage(message);
    final ai = message['senderType'] == 'ai';
    final scheme = Theme.of(context).colorScheme;
    final background = own
        ? scheme.primary
        : ai
        ? scheme.primary.withValues(alpha: 0.1)
        : scheme.surface;
    final foreground = own ? scheme.onPrimary : scheme.onSurface;
    return Align(
      alignment: own ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 340),
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: background,
          border: own ? null : Border.all(color: scheme.outlineVariant),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(own ? 14 : 4),
            bottomRight: Radius.circular(own ? 4 : 14),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!own) ...[
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (ai) ...[
                    Icon(
                      Icons.auto_awesome_rounded,
                      size: 14,
                      color: scheme.primary,
                    ),
                    const SizedBox(width: 5),
                  ],
                  Text(
                    ai
                        ? 'Kaya'
                        : message['sender']?['displayName'] ??
                              message['senderName'] ??
                              'Member',
                    style: TextStyle(
                      color: foreground,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
            ],
            Text(
              message['content'],
              style: TextStyle(color: foreground, height: 1.45),
            ),
          ],
        ),
      ),
    );
  }

  Widget conversationDrawer(BuildContext context, {required bool persistent}) {
    final scheme = Theme.of(context).colorScheme;
    final direct = conversations.cast<Map>().where(
      (item) => item['kind'] == 'direct',
    );
    final channels = conversations.cast<Map>().where(
      (item) => item['kind'] != 'direct',
    );
    Widget sectionLabel(String label) => Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 12, 7),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: scheme.onSurfaceVariant,
          fontWeight: FontWeight.w800,
          letterSpacing: .8,
        ),
      ),
    );
    Widget conversationItem(Map item) {
      final selected = active?['_id'] == item['_id'];
      final directMessage = item['kind'] == 'direct';
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: ListTile(
          selected: selected,
          selectedColor: scheme.onSecondaryContainer,
          selectedTileColor: scheme.secondaryContainer,
          leading: directMessage
              ? CircleAvatar(
                  radius: 18,
                  backgroundColor: selected
                      ? scheme.primary
                      : scheme.surfaceContainerHighest,
                  foregroundColor: selected
                      ? scheme.onPrimary
                      : scheme.onSurfaceVariant,
                  child: Text(
                    conversationInitials(item),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                )
              : SizedBox.square(
                  dimension: 36,
                  child: Icon(
                    Icons.tag_rounded,
                    color: selected ? scheme.primary : scheme.onSurfaceVariant,
                  ),
                ),
          title: Text(
            conversationLabel(item).replaceFirst('#', ''),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            conversationSubtitle(item),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: selected
              ? Icon(Icons.check_rounded, size: 18, color: scheme.primary)
              : null,
          onTap: () => chooseConversation(item),
        ),
      );
    }

    return Material(
      color: scheme.surfaceContainerLow,
      child: Column(
        children: [
          Container(
            height: 64,
            padding: const EdgeInsets.fromLTRB(18, 0, 8, 0),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: scheme.outlineVariant)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Messages',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: manageFriends,
                  tooltip: 'Add friends',
                  icon: const Icon(Icons.person_add_alt_1_outlined),
                ),
                if (!persistent)
                  IconButton(
                    onPressed: () => setState(() => conversationsOpen = false),
                    tooltip: 'Close conversations',
                    icon: const Icon(Icons.close_rounded),
                  ),
              ],
            ),
          ),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.only(top: 4, bottom: 20),
                    children: [
                      sectionLabel('DIRECT MESSAGES'),
                      for (final item in direct) conversationItem(item),
                      if (direct.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 18),
                          child: Text('No direct messages yet.'),
                        ),
                      sectionLabel('TEAM CHANNELS'),
                      for (final item in channels) conversationItem(item),
                      if (channels.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 18),
                          child: Text('No team channels yet.'),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget conversationPanel(BuildContext context, {required bool showMenu}) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        Container(
          height: 64,
          padding: EdgeInsets.fromLTRB(showMenu ? 8 : 20, 0, 8, 0),
          decoration: BoxDecoration(
            color: scheme.surface.withValues(alpha: 0.92),
            border: Border(bottom: BorderSide(color: scheme.outlineVariant)),
          ),
          child: Row(
            children: [
              if (showMenu)
                IconButton(
                  onPressed: () => setState(() => conversationsOpen = true),
                  tooltip: 'Open conversations',
                  icon: const Icon(Icons.menu_rounded),
                ),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      active == null
                          ? 'Messages'
                          : conversationLabel(active!).replaceFirst('#', ''),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (active != null)
                      Text(
                        conversationSubtitle(active!),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
              IconButton(
                onPressed: manageFriends,
                tooltip: 'Friends and requests',
                icon: const Icon(Icons.person_add_alt_1_outlined),
              ),
            ],
          ),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : active == null
              ? const EmptyCopy(
                  'Add a friend or create a team to start chatting.',
                )
              : RefreshIndicator(
                  onRefresh: loadMessages,
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      if (error != null) ErrorBox(error!),
                      for (final message in messages)
                        messageBubble(context, message),
                    ],
                  ),
                ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            decoration: BoxDecoration(
              color: scheme.surface.withValues(alpha: 0.94),
              border: Border(top: BorderSide(color: scheme.outlineVariant)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: text,
                    enabled: active != null,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      hintText: 'Message or mention @Kaya',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: active == null ? null : send,
                  tooltip: 'Send message',
                  icon: const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final wide = constraints.maxWidth >= 760;
      final drawerWidth = (constraints.maxWidth * .86).clamp(280.0, 340.0);
      if (wide) {
        return Row(
          children: [
            SizedBox(
              width: 290,
              child: conversationDrawer(context, persistent: true),
            ),
            VerticalDivider(
              width: 1,
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            Expanded(child: conversationPanel(context, showMenu: false)),
          ],
        );
      }
      final reduceMotion = MediaQuery.disableAnimationsOf(context);
      return Stack(
        children: [
          Positioned.fill(
            child: IgnorePointer(
              ignoring: conversationsOpen,
              child: ExcludeSemantics(
                excluding: conversationsOpen,
                child: conversationPanel(context, showMenu: true),
              ),
            ),
          ),
          if (conversationsOpen)
            Positioned.fill(
              child: GestureDetector(
                onTap: () => setState(() => conversationsOpen = false),
                child: ColoredBox(color: Colors.black.withValues(alpha: .46)),
              ),
            ),
          AnimatedPositioned(
            duration: reduceMotion
                ? Duration.zero
                : const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            top: 0,
            bottom: 0,
            left: conversationsOpen ? 0 : -drawerWidth,
            width: drawerWidth,
            child: IgnorePointer(
              ignoring: !conversationsOpen,
              child: ExcludeSemantics(
                excluding: !conversationsOpen,
                child: conversationDrawer(context, persistent: false),
              ),
            ),
          ),
        ],
      );
    },
  );
}

class MoreTab extends StatelessWidget {
  const MoreTab({
    required this.api,
    required this.user,
    required this.onLogout,
    required this.onTheme,
    required this.onUserUpdated,
    super.key,
  });
  final ApiClient api;
  final Map<String, dynamic> user;
  final VoidCallback onLogout, onTheme;
  final ValueChanged<Map<String, dynamic>> onUserUpdated;
  void open(BuildContext context, String title, Widget page) => Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: page,
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const PageHeader(
        title: 'Workspace',
        subtitle: 'Manage your account and connected tools.',
        icon: Icons.grid_view_rounded,
      ),
      const SizedBox(height: 24),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                radius: 25,
                backgroundColor: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.1),
                foregroundColor: Theme.of(context).colorScheme.primary,
                child: Text(
                  user['displayName']
                      .toString()
                      .trim()
                      .split(RegExp(r'\s+'))
                      .where((part) => part.isNotEmpty)
                      .take(2)
                      .map((part) => part[0].toUpperCase())
                      .join(),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user['displayName']?.toString() ?? 'KayaTo user',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user['email']?.toString() ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.verified_user_outlined,
                size: 20,
                color: Theme.of(context).colorScheme.primary,
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Column(
          children: [
            ListTile(
              minVerticalPadding: 12,
              leading: const Icon(Icons.calendar_month_outlined),
              title: const Text('Calendar'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  open(context, 'Calendar', CalendarPage(api: api, user: user)),
            ),
            const Divider(height: 1),
            ListTile(
              minVerticalPadding: 12,
              leading: const Icon(Icons.receipt_long_outlined),
              title: const Text('Bills & reminders'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => open(
                context,
                'Bills & reminders',
                BillsTab(api: api, user: user),
              ),
            ),
            const Divider(height: 1),
            ListTile(
              minVerticalPadding: 12,
              leading: const Icon(Icons.groups_outlined),
              title: const Text('Teams'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  open(context, 'Teams', TeamsPage(api: api, user: user)),
            ),
            const Divider(height: 1),
            ListTile(
              minVerticalPadding: 12,
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Settings'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => open(
                context,
                'Settings',
                SettingsTab(
                  api: api,
                  user: user,
                  onLogout: onLogout,
                  onTheme: onTheme,
                  onUserUpdated: onUserUpdated,
                ),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class TeamsPage extends StatefulWidget {
  const TeamsPage({required this.api, required this.user, super.key});
  final ApiClient api;
  final Map<String, dynamic> user;
  @override
  State<TeamsPage> createState() => _TeamsPageState();
}

class _TeamsPageState extends State<TeamsPage> {
  List teams = [];
  bool loading = true;
  final name = TextEditingController();
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      teams = await widget.api.request('/teams');
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> create() async {
    if (name.text.trim().length < 2) return;
    try {
      await widget.api.request(
        '/teams',
        method: 'POST',
        body: {'name': name.text},
      );
      name.clear();
      load();
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      if (error != null) ErrorBox(error!),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: name,
              decoration: const InputDecoration(labelText: 'New team name'),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: create,
            tooltip: 'Create team',
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      const SizedBox(height: 18),
      if (loading)
        const Center(child: CircularProgressIndicator())
      else if (teams.isEmpty)
        const EmptyCopy(
          'No team yet. Create one to unlock shared tasks and chat.',
        )
      else
        for (final team in teams)
          Card(
            child: ListTile(
              onTap: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => TeamDetailPage(
                      api: widget.api,
                      team: Map<String, dynamic>.from(team),
                      user: widget.user,
                    ),
                  ),
                );
                await load();
              },
              leading: const CircleAvatar(child: Icon(Icons.groups_outlined)),
              title: Text(
                team['name'],
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text('${(team['members'] as List).length} members'),
            ),
          ),
    ],
  );
}

class SettingsTab extends StatefulWidget {
  const SettingsTab({
    required this.api,
    required this.user,
    required this.onLogout,
    required this.onTheme,
    required this.onUserUpdated,
    super.key,
  });
  final ApiClient api;
  final Map<String, dynamic> user;
  final VoidCallback onLogout, onTheme;
  final ValueChanged<Map<String, dynamic>> onUserUpdated;
  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {
  late Map<String, bool> categories;
  late bool mobilePush;
  late String currency;
  late String timezone;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final preferences = Map<String, dynamic>.from(
      widget.user['notificationPreferences'] ?? const {},
    );
    final channels = Map<String, dynamic>.from(
      widget.user['notificationChannels'] ?? const {},
    );
    categories = {
      'taskAssignments': preferences['taskAssignments'] ?? true,
      'deadlines': preferences['deadlines'] ?? true,
      'teamMessages': preferences['teamMessages'] ?? true,
      'bills': preferences['bills'] ?? true,
    };
    mobilePush = channels['mobilePush'] ?? false;
    currency = supportedCurrencies.contains(widget.user['currency'])
        ? widget.user['currency']
        : 'PHP';
    timezone = supportedTimezones.contains(widget.user['timezone'])
        ? widget.user['timezone']
        : 'Asia/Manila';
  }

  Future<void> saveRegionalPreferences() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final updated = Map<String, dynamic>.from(
        await widget.api.request(
          '/auth/me',
          method: 'PATCH',
          body: {'currency': currency, 'timezone': timezone},
        ),
      );
      widget.user
        ..clear()
        ..addAll(updated);
      widget.onUserUpdated(updated);
      if (mounted) kayaToast.success('Regional settings updated');
    } catch (exception) {
      if (mounted) {
        setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> saveNotifications() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      if (mobilePush) {
        await PushService.enable(widget.api);
      } else {
        await PushService.disable(widget.api);
      }
      final existingChannels = Map<String, dynamic>.from(
        widget.user['notificationChannels'] ?? const {},
      );
      await widget.api.request(
        '/auth/me',
        method: 'PATCH',
        body: {
          'notificationPreferences': categories,
          'notificationChannels': {
            'inApp': existingChannels['inApp'] ?? true,
            'email': existingChannels['email'] ?? false,
            'browserPush': existingChannels['browserPush'] ?? false,
            'mobilePush': mobilePush,
          },
        },
      );
      if (mounted) {
        kayaToast.success(
          'Notifications updated',
          description: mobilePush
              ? 'This device can now receive KayaTo reminders.'
              : 'Mobile push is turned off on this device.',
        );
      }
    } catch (exception) {
      if (mounted) {
        setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      Text(
        'Settings',
        style: Theme.of(
          context,
        ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 16),
      Card(
        child: Column(
          children: [
            ListTile(
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(widget.user['displayName']),
              subtitle: Text(widget.user['email']),
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                final updated = await Navigator.push<Map<String, dynamic>>(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        ProfileEditPage(api: widget.api, user: widget.user),
                  ),
                );
                if (updated != null) {
                  widget.user
                    ..clear()
                    ..addAll(updated);
                  widget.onUserUpdated(updated);
                  if (mounted) setState(() {});
                }
              },
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.password_outlined),
              title: const Text('Change password'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChangePasswordPage(api: widget.api),
                ),
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.contrast_rounded),
              title: const Text('Switch light or dark mode'),
              onTap: widget.onTheme,
            ),
            ListTile(
              leading: Icon(
                Icons.logout_rounded,
                color: Theme.of(context).colorScheme.error,
              ),
              title: Text(
                'Log out',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              onTap: widget.onLogout,
            ),
            ListTile(
              leading: Icon(
                Icons.delete_forever_outlined,
                color: Theme.of(context).colorScheme.error,
              ),
              title: Text(
                'Delete account',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              subtitle: const Text(
                'Permanently remove your account and personal data',
              ),
              onTap: () async {
                final deleted = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => DeleteAccountPage(api: widget.api),
                  ),
                );
                if (deleted == true) widget.onLogout();
              },
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      Text(
        'Regional settings',
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 8),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              DropdownButtonFormField<String>(
                initialValue: timezone,
                decoration: const InputDecoration(labelText: 'Timezone'),
                items: supportedTimezones
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text(value.replaceAll('_', ' ')),
                      ),
                    )
                    .toList(),
                onChanged: saving
                    ? null
                    : (value) => setState(() => timezone = value!),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: currency,
                decoration: const InputDecoration(labelText: 'Currency'),
                items: supportedCurrencies
                    .map(
                      (value) =>
                          DropdownMenuItem(value: value, child: Text(value)),
                    )
                    .toList(),
                onChanged: saving
                    ? null
                    : (value) => setState(() => currency = value!),
              ),
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  onPressed: saving ? null : saveRegionalPreferences,
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('Save regional settings'),
                ),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 16),
      Text(
        'Notifications',
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 8),
      if (error != null) ErrorBox(error!),
      Card(
        child: Column(
          children: [
            for (final option in const [
              (
                'taskAssignments',
                'Task assignments',
                'Task activity and assignments',
              ),
              ('deadlines', 'Deadlines', 'Upcoming and overdue tasks'),
              ('teamMessages', 'Messages', 'Team, friend, and chat activity'),
              ('bills', 'Bills', 'Upcoming and overdue payments'),
            ]) ...[
              SwitchListTile(
                title: Text(option.$2),
                subtitle: Text(option.$3),
                value: categories[option.$1]!,
                onChanged: saving
                    ? null
                    : (value) => setState(() => categories[option.$1] = value),
              ),
              const Divider(height: 1),
            ],
            SwitchListTile(
              secondary: const Icon(Icons.notifications_active_outlined),
              title: const Text('Mobile push'),
              subtitle: Text(
                PushService.configured
                    ? 'Receive selected reminders on this device'
                    : 'Add Firebase dart-define values to enable mobile push',
              ),
              value: mobilePush,
              onChanged: saving || !PushService.configured
                  ? null
                  : (value) => setState(() => mobilePush = value),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: FilledButton.icon(
                onPressed: saving ? null : saveNotifications,
                icon: saving
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.save_outlined),
                label: Text(saving ? 'Saving...' : 'Save notifications'),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class PasswordResetScreen extends StatefulWidget {
  const PasswordResetScreen({
    required this.api,
    this.initialEmail = '',
    super.key,
  });
  final ApiClient api;
  final String initialEmail;
  @override
  State<PasswordResetScreen> createState() => _PasswordResetScreenState();
}

class _PasswordResetScreenState extends State<PasswordResetScreen> {
  late final TextEditingController email;
  final code = TextEditingController(),
      password = TextEditingController(),
      confirm = TextEditingController();
  bool codeSent = false, busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    email = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    email.dispose();
    code.dispose();
    password.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!codeSent) {
        await widget.api.request(
          '/auth/forgot-password',
          method: 'POST',
          body: {'email': email.text.trim()},
        );
        setState(() => codeSent = true);
        kayaToast.success(
          'Reset code requested',
          description: 'Check your email if it belongs to a KayaTo account.',
        );
      } else {
        if (password.text != confirm.text) {
          throw Exception('Passwords do not match.');
        }
        await widget.api.request(
          '/auth/reset-password',
          method: 'POST',
          body: {
            'email': email.text.trim(),
            'code': code.text.trim(),
            'newPassword': password.text,
          },
        );
        if (!mounted) return;
        kayaToast.success(
          'Password reset',
          description: 'You can now sign in with your new password.',
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Reset password')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          codeSent ? 'Enter your reset code' : 'Recover your account',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          codeSent
              ? 'Use the six-digit code sent to your email.'
              : 'We will send a short-lived code to your account email.',
        ),
        const SizedBox(height: 20),
        if (error != null) ErrorBox(error!),
        TextField(
          controller: email,
          enabled: !codeSent,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Email address'),
        ),
        if (codeSent) ...[
          const SizedBox(height: 12),
          TextField(
            controller: code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(
              labelText: '6-digit code',
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: password,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New password'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: confirm,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Confirm password'),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: busy ? null : submit,
          child: Text(
            busy
                ? 'Please wait...'
                : codeSent
                ? 'Reset password'
                : 'Send reset code',
          ),
        ),
        if (codeSent)
          TextButton(
            onPressed: busy ? null : () => setState(() => codeSent = false),
            child: const Text('Use another email'),
          ),
      ],
    ),
  );
}

class NotificationCenterPage extends StatefulWidget {
  const NotificationCenterPage({required this.api, super.key});
  final ApiClient api;
  @override
  State<NotificationCenterPage> createState() => _NotificationCenterPageState();
}

class _NotificationCenterPageState extends State<NotificationCenterPage> {
  List items = [];
  bool loading = true;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      items = await widget.api.request('/notifications');
      error = null;
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> read(Map item) async {
    if (item['read'] == true) return;
    await widget.api.request(
      '/notifications/${item['_id']}/read',
      method: 'PATCH',
    );
    item['read'] = true;
    if (mounted) setState(() {});
  }

  Future<void> readAll() async {
    await widget.api.request('/notifications/read', method: 'PATCH');
    for (final item in items) {
      item['read'] = true;
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Notifications'),
      actions: [
        TextButton(
          onPressed: items.any((item) => item['read'] != true) ? readAll : null,
          child: const Text('Read all'),
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null) ErrorBox(error!),
          if (loading)
            const Center(child: CircularProgressIndicator())
          else if (items.isEmpty)
            const EmptyCopy('You are all caught up.')
          else
            for (final item in items)
              Card(
                color: item['read'] == true
                    ? null
                    : Theme.of(
                        context,
                      ).colorScheme.primaryContainer.withValues(alpha: .45),
                child: ListTile(
                  onTap: () => read(item),
                  leading: Icon(
                    item['read'] == true
                        ? Icons.notifications_none
                        : Icons.notifications_active,
                  ),
                  title: Text(
                    item['message'] ?? 'KayaTo notification',
                    style: TextStyle(
                      fontWeight: item['read'] == true
                          ? FontWeight.w500
                          : FontWeight.w800,
                    ),
                  ),
                  subtitle: Text(
                    item['type']?.toString().replaceAll('-', ' ') ?? 'Update',
                  ),
                  trailing: item['read'] == true
                      ? null
                      : const Icon(Icons.circle, size: 9),
                ),
              ),
        ],
      ),
    ),
  );
}

class FriendsPage extends StatefulWidget {
  const FriendsPage({required this.api, super.key});
  final ApiClient api;
  @override
  State<FriendsPage> createState() => _FriendsPageState();
}

class _FriendsPageState extends State<FriendsPage> {
  final search = TextEditingController();
  Map<String, dynamic> data = {'friends': [], 'incoming': [], 'outgoing': []};
  List results = [];
  bool loading = true;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      data = Map<String, dynamic>.from(await widget.api.request('/friends'));
      error = null;
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> find() async {
    if (search.text.trim().length < 2) return;
    try {
      results = await widget.api.request(
        '/users/search?q=${Uri.encodeQueryComponent(search.text.trim())}',
      );
      setState(() {});
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> request(Map person) async {
    try {
      await widget.api.request(
        '/friends/requests',
        method: 'POST',
        body: {'recipientId': person['id']},
      );
      await load();
      await find();
    } catch (e) {
      kayaToast.error('Could not send request', description: e.toString());
    }
  }

  Future<void> accept(Map item) async {
    try {
      final response = await widget.api.request(
        '/friends/requests/${item['requestId']}',
        method: 'PATCH',
        body: {'action': 'accept'},
      );
      await load();
      if (mounted) {
        Navigator.pop(
          context,
          Map<String, dynamic>.from(response['conversation']),
        );
      }
    } catch (e) {
      kayaToast.error('Could not accept request', description: e.toString());
    }
  }

  Future<void> decline(Map item) async {
    await widget.api.request(
      '/friends/requests/${item['requestId']}',
      method: 'DELETE',
    );
    await load();
  }

  Future<void> openChat(Map item) async {
    final conversation = Map<String, dynamic>.from(
      await widget.api.request(
        '/friends/${item['user']['id']}/conversation',
        method: 'POST',
      ),
    );
    if (mounted) Navigator.pop(context, conversation);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Friends')),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: search,
                  onSubmitted: (_) => find(),
                  decoration: const InputDecoration(
                    labelText: 'Find by name, username, or email',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: find,
                icon: const Icon(Icons.search),
              ),
            ],
          ),
          if (error != null) ...[const SizedBox(height: 12), ErrorBox(error!)],
          if (results.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text(
              'Search results',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            for (final person in results)
              ListTile(
                title: Text(person['displayName']),
                subtitle: Text('@${person['username']}'),
                trailing: person['relationshipStatus'] == 'none'
                    ? TextButton(
                        onPressed: () => request(person),
                        child: const Text('Add'),
                      )
                    : Text(person['relationshipStatus']),
              ),
          ],
          if (loading)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            ),
          if ((data['incoming'] as List).isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text(
              'Requests',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            for (final item in data['incoming'])
              ListTile(
                title: Text(item['user']['displayName']),
                subtitle: Text('@${item['user']['username']}'),
                trailing: Wrap(
                  children: [
                    IconButton(
                      onPressed: () => decline(item),
                      icon: const Icon(Icons.close),
                    ),
                    IconButton.filled(
                      onPressed: () => accept(item),
                      icon: const Icon(Icons.check),
                    ),
                  ],
                ),
              ),
          ],
          const SizedBox(height: 16),
          const Text('Friends', style: TextStyle(fontWeight: FontWeight.w800)),
          if ((data['friends'] as List).isEmpty)
            const EmptyCopy('No friends yet. Search for a KayaTo user above.')
          else
            for (final item in data['friends'])
              Card(
                child: ListTile(
                  onTap: () => openChat(item),
                  leading: const CircleAvatar(
                    child: Icon(Icons.person_outline),
                  ),
                  title: Text(item['user']['displayName']),
                  subtitle: Text('@${item['user']['username']}'),
                  trailing: const Icon(Icons.chat_bubble_outline),
                ),
              ),
          if ((data['outgoing'] as List).isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text(
              'Sent requests',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            for (final item in data['outgoing'])
              ListTile(
                title: Text(item['user']['displayName']),
                trailing: TextButton(
                  onPressed: () => decline(item),
                  child: const Text('Cancel'),
                ),
              ),
          ],
        ],
      ),
    ),
  );
}

class CalendarPage extends StatefulWidget {
  const CalendarPage({required this.api, required this.user, super.key});
  final ApiClient api;
  final Map<String, dynamic> user;
  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  DateTime selected = DateTime.now();
  List tasks = [], bills = [];
  bool loading = true;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final results = await Future.wait([
      widget.api.request('/tasks'),
      widget.api.request('/bills'),
    ]);
    tasks = results[0];
    bills = results[1];
    if (mounted) setState(() => loading = false);
  }

  bool sameDay(dynamic raw) {
    final value = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    return value != null &&
        value.year == selected.year &&
        value.month == selected.month &&
        value.day == selected.day;
  }

  Future<void> createTask() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const TaskSheet(),
    );
    if (result != null) {
      await widget.api.request('/tasks', method: 'POST', body: result);
      await load();
    }
  }

  Future<void> createBill() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BillSheet(currency: widget.user['currency'] ?? 'PHP'),
    );
    if (result != null) {
      await widget.api.request('/bills', method: 'POST', body: result);
      await load();
    }
  }

  Future<void> editTask(Map task) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => TaskSheet(task: Map<String, dynamic>.from(task)),
    );
    if (result == null) return;
    final target = result.remove('status');
    await widget.api.request(
      '/tasks/${task['_id']}',
      method: 'PATCH',
      body: result,
    );
    const states = ['todo', 'in-progress', 'review', 'done'];
    var current = task['status'];
    while (current != target) {
      final at = states.indexOf(current);
      final destination = states.indexOf(target);
      current = states[at + (destination > at ? 1 : -1)];
      await widget.api.request(
        '/tasks/${task['_id']}',
        method: 'PATCH',
        body: {'status': current},
      );
    }
    await load();
  }

  Future<void> editBill(Map bill) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BillSheet(
        currency: widget.user['currency'] ?? 'PHP',
        bill: Map<String, dynamic>.from(bill),
      ),
    );
    if (result != null) {
      await widget.api.request(
        '/bills/${bill['_id']}',
        method: 'PATCH',
        body: result,
      );
      await load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final dayTasks = tasks.where((item) => sameDay(item['dueDate'])).toList();
    final dayBills = bills.where((item) => sameDay(item['dueDate'])).toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        CalendarDatePicker(
          initialDate: selected,
          firstDate: DateTime(2000),
          lastDate: DateTime.now().add(const Duration(days: 3650)),
          onDateChanged: (value) => setState(() => selected = value),
        ),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: createTask,
                icon: const Icon(Icons.add_task),
                label: const Text('Add task'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: createBill,
                icon: const Icon(Icons.add_card),
                label: const Text('Add bill'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (loading)
          const Center(child: CircularProgressIndicator())
        else ...[
          Text(
            'Schedule for ${selected.toIso8601String().split('T').first}',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          if (dayTasks.isEmpty && dayBills.isEmpty)
            const EmptyCopy('Nothing scheduled for this day.'),
          for (final task in dayTasks)
            Card(
              child: ListTile(
                onTap: () => editTask(task),
                leading: const Icon(Icons.task_alt),
                title: Text(task['title']),
                subtitle: Text('${task['project']} · ${task['status']}'),
                trailing: const Icon(Icons.edit_outlined),
              ),
            ),
          for (final bill in dayBills)
            Card(
              child: ListTile(
                onTap: () => editBill(bill),
                leading: const Icon(Icons.receipt_long_outlined),
                title: Text(bill['name']),
                subtitle: Text(
                  formatMoney(
                    bill['amount'] as num,
                    bill['currency'] ?? widget.user['currency'] ?? 'PHP',
                  ),
                ),
                trailing: const Icon(Icons.edit_outlined),
              ),
            ),
        ],
      ],
    );
  }
}

class TeamDetailPage extends StatefulWidget {
  const TeamDetailPage({
    required this.api,
    required this.team,
    required this.user,
    super.key,
  });
  final ApiClient api;
  final Map<String, dynamic> team, user;
  @override
  State<TeamDetailPage> createState() => _TeamDetailPageState();
}

class _TeamDetailPageState extends State<TeamDetailPage> {
  late Map<String, dynamic> team;
  late final TextEditingController name, description, memberIdentifier;
  String memberRole = 'member';
  String? error;
  @override
  void initState() {
    super.initState();
    team = widget.team;
    name = TextEditingController(text: team['name']);
    description = TextEditingController(text: team['description'] ?? '');
    memberIdentifier = TextEditingController();
  }

  @override
  void dispose() {
    name.dispose();
    description.dispose();
    memberIdentifier.dispose();
    super.dispose();
  }

  String userId(Map member) =>
      '${member['user']?['_id'] ?? member['user']?['id'] ?? member['user']}';
  bool get owner =>
      '${team['owner']?['_id'] ?? team['owner']?['id'] ?? team['owner']}' ==
      '${widget.user['id'] ?? widget.user['_id']}';
  Future<void> save() async {
    try {
      team = Map<String, dynamic>.from(
        await widget.api.request(
          '/teams/${team['_id']}',
          method: 'PATCH',
          body: {'name': name.text, 'description': description.text},
        ),
      );
      setState(() {});
      kayaToast.success('Team updated');
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> addMember() async {
    try {
      team = Map<String, dynamic>.from(
        await widget.api.request(
          '/teams/${team['_id']}/members',
          method: 'POST',
          body: {
            'identifier': memberIdentifier.text.trim(),
            'role': memberRole,
          },
        ),
      );
      memberIdentifier.clear();
      setState(() {});
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> role(Map member, String value) async {
    team = Map<String, dynamic>.from(
      await widget.api.request(
        '/teams/${team['_id']}/members/${userId(member)}',
        method: 'PATCH',
        body: {'role': value},
      ),
    );
    setState(() {});
  }

  Future<void> transferOwnership(Map member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Transfer team ownership?'),
        content: Text(
          '${member['user']?['displayName'] ?? 'This member'} will become the owner. Your role will change to manager.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Transfer ownership'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    team = Map<String, dynamic>.from(
      await widget.api.request(
        '/teams/${team['_id']}/transfer-ownership',
        method: 'POST',
        body: {'userId': userId(member)},
      ),
    );
    if (mounted) setState(() {});
  }

  Future<void> remove(Map member) async {
    team = Map<String, dynamic>.from(
      await widget.api.request(
        '/teams/${team['_id']}/members/${userId(member)}',
        method: 'DELETE',
      ),
    );
    setState(() {});
  }

  Future<void> deleteTeam() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete team?'),
        content: const Text(
          'Shared tasks, chat, and activity for this team will be permanently removed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete team'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.api.request('/teams/${team['_id']}', method: 'DELETE');
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(team['name'])),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (error != null) ErrorBox(error!),
        TextField(
          controller: name,
          decoration: const InputDecoration(labelText: 'Team name'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: description,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Description'),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(
            onPressed: save,
            icon: const Icon(Icons.save_outlined),
            label: const Text('Save team'),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Add member',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: memberIdentifier,
          decoration: const InputDecoration(
            labelText: 'Username or email',
            hintText: '@username or name@example.com',
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: memberRole,
                decoration: const InputDecoration(labelText: 'Role'),
                items: const ['manager', 'member', 'viewer']
                    .map(
                      (value) =>
                          DropdownMenuItem(value: value, child: Text(value)),
                    )
                    .toList(),
                onChanged: (value) => memberRole = value!,
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: addMember,
              icon: const Icon(Icons.person_add_alt_1),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Text(
          'Members',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        for (final member in (team['members'] as List))
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const CircleAvatar(child: Icon(Icons.person_outline)),
            title: Text(member['user']?['displayName'] ?? 'Member'),
            subtitle: Text(member['user']?['email'] ?? ''),
            trailing: !owner || member['role'] == 'owner'
                ? Text(member['role'])
                : PopupMenuButton<String>(
                    onSelected: (value) => value == 'remove'
                        ? remove(member)
                        : value == 'owner'
                        ? transferOwnership(member)
                        : role(member, value),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'owner', child: Text('Make owner')),
                      PopupMenuItem(value: 'manager', child: Text('Manager')),
                      PopupMenuItem(value: 'member', child: Text('Member')),
                      PopupMenuItem(value: 'viewer', child: Text('Viewer')),
                      PopupMenuItem(value: 'remove', child: Text('Remove')),
                    ],
                  ),
          ),
        if (owner) ...[
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: deleteTeam,
            icon: const Icon(Icons.delete_outline),
            label: const Text('Delete team'),
          ),
        ],
      ],
    ),
  );
}

class ProfileEditPage extends StatefulWidget {
  const ProfileEditPage({required this.api, required this.user, super.key});
  final ApiClient api;
  final Map<String, dynamic> user;
  @override
  State<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends State<ProfileEditPage> {
  late final TextEditingController first, last, username;
  late String timezone, currency, usage;
  String? error;
  @override
  void initState() {
    super.initState();
    first = TextEditingController(text: widget.user['firstName'] ?? '');
    last = TextEditingController(text: widget.user['lastName'] ?? '');
    username = TextEditingController(text: widget.user['username'] ?? '');
    timezone = widget.user['timezone'] ?? 'Asia/Manila';
    currency = widget.user['currency'] ?? 'PHP';
    usage = widget.user['primaryUsage'] ?? 'both';
  }

  @override
  void dispose() {
    first.dispose();
    last.dispose();
    username.dispose();
    super.dispose();
  }

  Future<void> save() async {
    try {
      final result = Map<String, dynamic>.from(
        await widget.api.request(
          '/auth/me',
          method: 'PATCH',
          body: {
            'firstName': first.text,
            'lastName': last.text,
            'username': username.text,
            'timezone': timezone,
            'currency': currency,
            'primaryUsage': usage,
          },
        ),
      );
      if (mounted) Navigator.pop(context, result);
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Edit profile')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (error != null) ErrorBox(error!),
        TextField(
          controller: first,
          inputFormatters: nameInputFormatters,
          decoration: const InputDecoration(labelText: 'First name'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: last,
          inputFormatters: nameInputFormatters,
          decoration: const InputDecoration(labelText: 'Last name'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: username,
          decoration: const InputDecoration(
            labelText: 'Username',
            prefixText: '@',
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: timezone,
          decoration: const InputDecoration(labelText: 'Timezone'),
          items: supportedTimezones
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) => timezone = value!,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: currency,
          decoration: const InputDecoration(labelText: 'Currency'),
          items: supportedCurrencies
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) => currency = value!,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: usage,
          decoration: const InputDecoration(labelText: 'Primary use'),
          items:
              const [
                    ('personal', 'Personal'),
                    ('team', 'Team'),
                    ('both', 'Personal and team'),
                  ]
                  .map(
                    (value) => DropdownMenuItem(
                      value: value.$1,
                      child: Text(value.$2),
                    ),
                  )
                  .toList(),
          onChanged: (value) => usage = value!,
        ),
        const SizedBox(height: 20),
        FilledButton(onPressed: save, child: const Text('Save profile')),
      ],
    ),
  );
}

class ChangePasswordPage extends StatefulWidget {
  const ChangePasswordPage({required this.api, super.key});
  final ApiClient api;
  @override
  State<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends State<ChangePasswordPage> {
  final current = TextEditingController(),
      next = TextEditingController(),
      confirm = TextEditingController();
  String? error;
  bool busy = false;
  @override
  void dispose() {
    current.dispose();
    next.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (next.text != confirm.text) {
      setState(() => error = 'Passwords do not match.');
      return;
    }
    setState(() => busy = true);
    try {
      await widget.api.request(
        '/auth/change-password',
        method: 'POST',
        body: {'currentPassword': current.text, 'newPassword': next.text},
      );
      if (mounted) {
        kayaToast.success('Password changed');
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Change password')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (error != null) ErrorBox(error!),
        TextField(
          controller: current,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Current password'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: next,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'New password'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: confirm,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Confirm new password'),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: busy ? null : save,
          child: Text(busy ? 'Updating...' : 'Update password'),
        ),
      ],
    ),
  );
}

class DeleteAccountPage extends StatefulWidget {
  const DeleteAccountPage({required this.api, super.key});
  final ApiClient api;
  @override
  State<DeleteAccountPage> createState() => _DeleteAccountPageState();
}

class _DeleteAccountPageState extends State<DeleteAccountPage> {
  final password = TextEditingController(),
      confirmation = TextEditingController();
  String? error;
  bool busy = false;
  @override
  void dispose() {
    password.dispose();
    confirmation.dispose();
    super.dispose();
  }

  Future<void> remove() async {
    setState(() => busy = true);
    try {
      await widget.api.request(
        '/auth/me',
        method: 'DELETE',
        body: {'password': password.text, 'confirmation': confirmation.text},
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Delete account')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'This is permanent',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: Theme.of(context).colorScheme.error,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Your personal tasks, bills, friendships, and direct chats will be removed. Teams with other members must be transferred first.',
        ),
        const SizedBox(height: 20),
        if (error != null) ErrorBox(error!),
        TextField(
          controller: password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Current password'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: confirmation,
          decoration: const InputDecoration(labelText: 'Type DELETE'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed:
              busy || password.text.isEmpty || confirmation.text != 'DELETE'
              ? null
              : remove,
          style: FilledButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
          child: Text(busy ? 'Deleting...' : 'Permanently delete account'),
        ),
      ],
    ),
  );
}

class TaskSheet extends StatefulWidget {
  const TaskSheet({this.task, super.key});
  final Map<String, dynamic>? task;
  @override
  State<TaskSheet> createState() => _TaskSheetState();
}

class _TaskSheetState extends State<TaskSheet> {
  final key = GlobalKey<FormState>();
  late final TextEditingController title, project, description, due;
  String priority = 'medium';
  String status = 'todo';
  List<Map<String, dynamic>> subtasks = [];

  @override
  void initState() {
    super.initState();
    final task = widget.task;
    title = TextEditingController(text: task?['title'] ?? '');
    project = TextEditingController(text: task?['project'] ?? 'Personal');
    description = TextEditingController(text: task?['description'] ?? '');
    due = TextEditingController(
      text: task?['dueDate'] == null ? '' : formatDateOnly(task?['dueDate']),
    );
    priority = task?['priority'] ?? 'medium';
    status = task?['status'] ?? 'todo';
    subtasks = (task?['subtasks'] as List? ?? const [])
        .map(
          (item) => {
            'title': item['title'].toString(),
            'completed': item['completed'] == true,
          },
        )
        .toList();
  }

  @override
  void dispose() {
    title.dispose();
    project.dispose();
    description.dispose();
    due.dispose();
    super.dispose();
  }

  Future<void> addSubtask() async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add subtask'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Subtask title'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value != null && value.isNotEmpty) {
      setState(() => subtasks.add({'title': value, 'completed': false}));
    }
  }

  @override
  Widget build(BuildContext context) => FormSheet(
    title: widget.task == null ? 'Create task' : 'Edit task',
    child: Form(
      key: key,
      child: Column(
        children: [
          TextFormField(
            controller: title,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Task title'),
            validator: (v) => (v ?? '').trim().isEmpty ? 'Enter a title' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: description,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: 'Description',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: project,
            decoration: const InputDecoration(labelText: 'Project'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField(
            initialValue: priority,
            decoration: const InputDecoration(labelText: 'Priority'),
            items: const [
              'low',
              'medium',
              'high',
              'urgent',
            ].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(),
            onChanged: (v) => priority = v!,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: const ['todo', 'in-progress', 'review', 'done']
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) => status = value!,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: due,
            readOnly: true,
            decoration: InputDecoration(
              labelText: 'Due date',
              suffixIcon: due.text.isEmpty
                  ? const Icon(Icons.calendar_today_outlined)
                  : IconButton(
                      onPressed: () => setState(due.clear),
                      icon: const Icon(Icons.clear),
                    ),
            ),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                firstDate: DateTime(2000),
                lastDate: DateTime.now().add(const Duration(days: 3650)),
              );
              if (picked != null) {
                setState(
                  () => due.text = picked.toIso8601String().split('T').first,
                );
              }
            },
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Subtasks',
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              TextButton.icon(
                onPressed: addSubtask,
                icon: const Icon(Icons.add),
                label: const Text('Add'),
              ),
            ],
          ),
          for (var index = 0; index < subtasks.length; index++)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: subtasks[index]['completed'] == true,
              title: Text(subtasks[index]['title']),
              onChanged: (value) =>
                  setState(() => subtasks[index]['completed'] = value == true),
              secondary: IconButton(
                onPressed: () => setState(() => subtasks.removeAt(index)),
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Remove subtask',
              ),
            ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () {
              if (key.currentState!.validate()) {
                Navigator.pop(context, {
                  'title': title.text,
                  'project': project.text,
                  'taskType': 'personal',
                  'priority': priority,
                  'description': description.text,
                  'status': status,
                  'dueDate': due.text.isEmpty ? null : due.text,
                  'subtasks': subtasks,
                });
              }
            },
            child: Text(widget.task == null ? 'Create task' : 'Save task'),
          ),
        ],
      ),
    ),
  );
}

class BillSheet extends StatefulWidget {
  const BillSheet({required this.currency, this.bill, super.key});
  final String currency;
  final Map<String, dynamic>? bill;
  @override
  State<BillSheet> createState() => _BillSheetState();
}

class _BillSheetState extends State<BillSheet> {
  static const categories = [
    'Utilities',
    'Internet',
    'Mobile',
    'Rent',
    'Subscription',
    'Insurance',
    'Loan',
    'Education',
    'Healthcare',
    'Transportation',
    'Other',
  ];
  final key = GlobalKey<FormState>();
  late final TextEditingController name, amount, due, paymentUrl, reminderDays;
  String category = 'Other', cycle = 'monthly', status = 'unpaid';
  @override
  void initState() {
    super.initState();
    final bill = widget.bill;
    name = TextEditingController(text: bill?['name'] ?? '');
    amount = TextEditingController(text: bill?['amount']?.toString() ?? '');
    due = TextEditingController(
      text: bill?['dueDate'] == null ? '' : formatDateOnly(bill?['dueDate']),
    );
    category = bill?['category'] ?? 'Other';
    if (!categories.contains(category)) category = 'Other';
    paymentUrl = TextEditingController(text: bill?['officialPaymentUrl'] ?? '');
    reminderDays = TextEditingController(
      text: (bill?['reminderDaysBefore'] as List? ?? const [3, 1]).join(', '),
    );
    cycle = bill?['billingCycle'] ?? 'monthly';
    status = bill?['status'] ?? 'unpaid';
  }

  @override
  void dispose() {
    name.dispose();
    amount.dispose();
    due.dispose();
    paymentUrl.dispose();
    reminderDays.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormSheet(
    title: widget.bill == null ? 'Add bill reminder' : 'Edit bill reminder',
    child: Form(
      key: key,
      child: Column(
        children: [
          TextFormField(
            controller: name,
            decoration: const InputDecoration(labelText: 'Biller name'),
            validator: (v) => (v ?? '').isEmpty ? 'Enter a name' : null,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: category,
            decoration: const InputDecoration(labelText: 'Category'),
            items: categories
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) => category = value!,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: cycle,
            decoration: const InputDecoration(labelText: 'Billing cycle'),
            items:
                const ['one_time', 'weekly', 'monthly', 'quarterly', 'yearly']
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text(value.replaceAll('_', ' ')),
                      ),
                    )
                    .toList(),
            onChanged: (value) => cycle = value!,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: const ['unpaid', 'paid', 'overdue', 'skipped']
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) => status = value!,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: amount,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Amount (${widget.currency})',
            ),
            validator: (v) => double.tryParse(v ?? '') == null
                ? 'Enter a valid amount'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: reminderDays,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Remind days before',
              hintText: '3, 1',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: paymentUrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Official payment URL (optional)',
            ),
            validator: (value) =>
                value != null &&
                    value.isNotEmpty &&
                    !value.startsWith('https://')
                ? 'Use an HTTPS link'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: due,
            readOnly: true,
            decoration: const InputDecoration(
              labelText: 'Due date',
              suffixIcon: Icon(Icons.calendar_today_outlined),
            ),
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 3650)),
              );
              if (d != null) {
                setState(() => due.text = d.toIso8601String().split('T').first);
              }
            },
            validator: (v) => (v ?? '').isEmpty ? 'Choose a due date' : null,
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () {
              if (key.currentState!.validate()) {
                Navigator.pop(context, {
                  'name': name.text,
                  'amount': double.parse(amount.text),
                  'currency': widget.currency,
                  'dueDate': due.text,
                  'category': category,
                  'billingCycle': cycle,
                  'status': status,
                  'reminderDaysBefore': reminderDays.text
                      .split(',')
                      .map((value) => int.tryParse(value.trim()))
                      .whereType<int>()
                      .toList(),
                  'officialPaymentUrl': paymentUrl.text.trim(),
                });
              }
            },
            child: Text(widget.bill == null ? 'Save reminder' : 'Save changes'),
          ),
        ],
      ),
    ),
  );
}

class FormSheet extends StatelessWidget {
  const FormSheet({required this.title, required this.child, super.key});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                  tooltip: 'Close',
                ),
              ],
            ),
            const SizedBox(height: 20),
            child,
          ],
        ),
      ),
    ),
  );
}

class KayaBrandLockup extends StatelessWidget {
  const KayaBrandLockup({this.compact = false, super.key});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final url = compact
        ? '$kayaWebUrl/brand/${dark ? 'kayato-whitelogo.svg' : 'kayato-redlogo.svg'}'
        : '$kayaWebUrl/brand/${dark ? 'kayato-textlogo_allwhite.svg' : 'kayato-textlogo_black.svg'}';
    return Semantics(
      label: 'KayaTo',
      image: true,
      child: SizedBox(
        width: compact ? 34 : 102,
        height: compact ? 34 : 32,
        child: SvgPicture.network(
          url,
          key: ValueKey(url),
          fit: BoxFit.contain,
          alignment: Alignment.centerLeft,
          excludeFromSemantics: true,
          colorFilter: dark
              ? const ColorFilter.mode(Color(0xFFF5F4F2), BlendMode.srcIn)
              : null,
          placeholderBuilder: (context) => Text(
            'KayaTo',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: dark ? const Color(0xFFF5F4F2) : kayaInk,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.7,
            ),
          ),
        ),
      ),
    );
  }
}

class KayaBrandIcon extends StatelessWidget {
  const KayaBrandIcon({this.size = 48, super.key});
  final double size;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: 'KayaTo',
      image: true,
      child: SizedBox.square(
        dimension: size,
        child: SvgPicture.network(
          '$kayaWebUrl/brand/${dark ? 'kayato-whitelogo.svg' : 'kayato-redlogo.svg'}',
          fit: BoxFit.contain,
          excludeFromSemantics: true,
          colorFilter: dark
              ? const ColorFilter.mode(Color(0xFFF5F4F2), BlendMode.srcIn)
              : null,
          placeholderBuilder: (context) => const SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
    );
  }
}

class PageHeader extends StatelessWidget {
  const PageHeader({
    required this.title,
    required this.subtitle,
    required this.icon,
    super.key,
  });
  final String title, subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Container(
        width: 42,
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(11),
        ),
        child: Icon(
          icon,
          size: 21,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
      const SizedBox(width: 13),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class LoadingPanel extends StatelessWidget {
  const LoadingPanel({required this.label, super.key});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 42),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
    ),
    child: Column(
      children: [
        const SizedBox.square(
          dimension: 24,
          child: CircularProgressIndicator(strokeWidth: 2.5),
        ),
        const SizedBox(height: 14),
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

class StatusIcon extends StatelessWidget {
  const StatusIcon({this.status, super.key});
  final String? status;

  @override
  Widget build(BuildContext context) {
    final done = status == 'done';
    final active = status == 'in-progress' || status == 'review';
    final color = done
        ? kayaSuccess
        : active
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.onSurfaceVariant;
    final icon = done
        ? Icons.check_rounded
        : active
        ? Icons.timelapse_rounded
        : Icons.circle_outlined;
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Icon(icon, size: 19, color: color),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    required this.title,
    required this.children,
    this.subtitle,
    super.key,
  });
  final String title;
  final String? subtitle;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 3),
            Text(
              subtitle!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    ),
  );
}

class PriorityChip extends StatelessWidget {
  const PriorityChip(this.value, {super.key});
  final String value;
  @override
  Widget build(BuildContext context) {
    final normalized = value.toLowerCase();
    final color = normalized == 'urgent' || normalized == 'high'
        ? Theme.of(context).colorScheme.error
        : normalized == 'medium'
        ? kayaWarning
        : kayaSuccess;
    return Chip(
      label: Text(value),
      visualDensity: VisualDensity.compact,
      backgroundColor: color.withValues(alpha: 0.09),
      side: BorderSide(color: color.withValues(alpha: 0.2)),
      labelStyle: TextStyle(
        color: color,
        fontSize: 11,
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class EmptyCopy extends StatelessWidget {
  const EmptyCopy(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 44),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
    ),
    child: Column(
      children: [
        Container(
          width: 48,
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Theme.of(
              context,
            ).colorScheme.primary.withValues(alpha: 0.09),
            borderRadius: BorderRadius.circular(13),
          ),
          child: Icon(
            Icons.inbox_outlined,
            size: 24,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
        const SizedBox(height: 14),
        Text(
          text,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    ),
  );
}

class ErrorBox extends StatelessWidget {
  const ErrorBox(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.errorContainer,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: Theme.of(context).colorScheme.error.withValues(alpha: 0.28),
      ),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.error_outline_rounded,
          size: 19,
          color: Theme.of(context).colorScheme.onErrorContainer,
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
          ),
        ),
      ],
    ),
  );
}
