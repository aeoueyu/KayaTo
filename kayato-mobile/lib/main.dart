import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
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
bool emailSyntaxIsValid(String value) => RegExp(
  r'^[^\s@]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$',
).hasMatch(value.trim());

void main() => runApp(const KayaToApp());

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

class _KayaToAppState extends State<KayaToApp> {
  final api = ApiClient();
  ThemeMode mode = ThemeMode.system;
  Map<String, dynamic>? user;
  bool loading = true;
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    api.token = prefs.getString('token');
    if (api.token != null) {
      try {
        user = await api.request('/auth/me');
      } catch (_) {
        await prefs.remove('token');
        api.token = null;
      }
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> signedIn(Map<String, dynamic> data) async {
    api.token = data['token'];
    user = data['user'];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', api.token!);
    setState(() {});
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    api.token = null;
    setState(() => user = null);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'KayaTo',
    debugShowCheckedModeBanner: false,
    themeMode: mode,
    theme: _theme(false),
    darkTheme: _theme(true),
    builder: (context, child) => KayaToaster(child: child!),
    home: loading
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : user == null
        ? AuthScreen(api: api, onSuccess: signedIn)
        : HomeScreen(
            api: api,
            user: user!,
            onLogout: logout,
            onTheme: () => setState(
              () => mode = mode == ThemeMode.dark
                  ? ThemeMode.light
                  : ThemeMode.dark,
            ),
          ),
  );
}

ThemeData _theme(bool dark) {
  const ruby = Color(0xFF70000E);
  final scheme = ColorScheme.fromSeed(
    seedColor: ruby,
    brightness: dark ? Brightness.dark : Brightness.light,
    primary: dark ? const Color(0xFFFF8A99) : ruby,
    surface: dark ? const Color(0xFF171515) : const Color(0xFFF5F4F2),
    error: dark ? const Color(0xFFFF8A99) : ruby,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark
        ? const Color(0xFF030303)
        : const Color(0xFFF5F4F2),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 72,
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
    ),
  );
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({required this.api, required this.onSuccess, super.key});
  final ApiClient api;
  final ValueChanged<Map<String, dynamic>> onSuccess;
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
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          'K',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.onPrimary,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        register
                            ? awaitingCode
                                  ? 'Verify your email'
                                  : 'Create your KayaTo account'
                            : 'Welcome back',
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        register
                            ? awaitingCode
                                  ? 'Enter the 6-digit code sent to ${email.text}.'
                                  : 'Organize personal and team work in one place.'
                            : 'Continue where you left off.',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 24),
                      if (error != null) ErrorBox(error!),
                      if (register && awaitingCode) ...[
                        const Text(
                          'Verification code *',
                          style: TextStyle(fontWeight: FontWeight.w700),
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
                                    keyboardType: TextInputType.number,
                                    textInputAction: index == 5
                                        ? TextInputAction.done
                                        : TextInputAction.next,
                                    autofillHints: index == 0
                                        ? const [AutofillHints.oneTimeCode]
                                        : null,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.digitsOnly,
                                    ],
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w800,
                                    ),
                                    decoration: const InputDecoration(
                                      counterText: '',
                                      contentPadding: EdgeInsets.symmetric(
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
                                        : (_) => otpFocusNodes[index + 1]
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
                          child: const Text('Change email or account details'),
                        ),
                      ] else ...[
                        if (register) ...[
                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  controller: firstName,
                                  textInputAction: TextInputAction.next,
                                  autofillHints: const [
                                    AutofillHints.givenName,
                                  ],
                                  textCapitalization: TextCapitalization.words,
                                  inputFormatters: nameInputFormatters,
                                  decoration: const InputDecoration(
                                    labelText: 'First name *',
                                  ),
                                  validator: (v) => (v ?? '').trim().length < 2
                                      ? 'Enter first name'
                                      : null,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: TextFormField(
                                  controller: lastName,
                                  textInputAction: TextInputAction.next,
                                  autofillHints: const [
                                    AutofillHints.familyName,
                                  ],
                                  textCapitalization: TextCapitalization.words,
                                  inputFormatters: nameInputFormatters,
                                  decoration: const InputDecoration(
                                    labelText: 'Last name *',
                                  ),
                                  validator: (v) => (v ?? '').trim().length < 2
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
                              style: Theme.of(context).textTheme.bodySmall
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
                            if (!focused && register && !awaitingCode) {
                              validateEmailDomain();
                            }
                          },
                          child: TextFormField(
                            controller: email,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.email],
                            decoration: InputDecoration(
                              labelText: 'Email address *',
                              errorText: emailDomainError,
                              suffixIcon: emailChecking
                                  ? const Padding(
                                      padding: EdgeInsets.all(14),
                                      child: SizedBox.square(
                                        dimension: 18,
                                        child: CircularProgressIndicator(
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
                                !emailSyntaxIsValid((v ?? '').trim())
                                ? 'Enter a complete email address'
                                : null,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Focus(
                          onFocusChange: (focused) =>
                              setState(() => passwordFocused = focused),
                          child: TextFormField(
                            controller: password,
                            obscureText: hidden,
                            autofillHints: [
                              register
                                  ? AutofillHints.newPassword
                                  : AutofillHints.password,
                            ],
                            decoration: InputDecoration(
                              labelText: 'Password *',
                              suffixIcon: IconButton(
                                onPressed: () =>
                                    setState(() => hidden = !hidden),
                                icon: Icon(
                                  hidden
                                      ? Icons.visibility_outlined
                                      : Icons.visibility_off_outlined,
                                ),
                              ),
                            ),
                            onChanged: register ? (_) => setState(() {}) : null,
                            validator: (v) => register && !strongPassword
                                ? 'Complete all password requirements'
                                : (v ?? '').length < 8
                                ? 'Use at least 8 characters'
                                : null,
                            onFieldSubmitted: register ? null : (_) => submit(),
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
                                met: RegExp(r'[A-Z]').hasMatch(password.text),
                              ),
                              PasswordRule(
                                label: 'One lowercase letter',
                                met: RegExp(r'[a-z]').hasMatch(password.text),
                              ),
                              PasswordRule(
                                label: 'One number',
                                met: RegExp(r'\d').hasMatch(password.text),
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
                            autofillHints: const [AutofillHints.newPassword],
                            decoration: InputDecoration(
                              labelText: 'Confirm password *',
                              suffixIcon: IconButton(
                                onPressed: () => setState(
                                  () => confirmHidden = !confirmHidden,
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
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: busy || emailChecking ? null : submit,
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
    required this.onTheme,
    super.key,
  });
  final ApiClient api;
  final Map<String, dynamic> user;
  final VoidCallback onLogout, onTheme;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int index = 0;
  @override
  Widget build(BuildContext context) {
    final pages = [
      DashboardTab(api: widget.api, user: widget.user),
      TasksTab(api: widget.api),
      PlannerTab(api: widget.api),
      ChatTab(api: widget.api),
      MoreTab(
        api: widget.api,
        user: widget.user,
        onLogout: widget.onLogout,
        onTheme: widget.onTheme,
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'KayaTo',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            onPressed: widget.onTheme,
            tooltip: 'Switch theme',
            icon: const Icon(Icons.contrast_rounded),
          ),
        ],
      ),
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
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
        Text(
          'Good day, ${widget.user['displayName'].toString().split(' ').first}.',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        Text(
          'Your latest work at a glance.',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 20),
        if (error != null) ErrorBox(error!),
        if (data == null && error == null)
          const Center(child: CircularProgressIndicator())
        else if (data != null) ...[
          Row(
            children: [
              Metric(
                label: 'Completed',
                value: '${data!['metrics']['completed']}',
                icon: Icons.check_circle_outline,
              ),
              const SizedBox(width: 12),
              Metric(
                label: 'In progress',
                value: '${data!['metrics']['inProgress']}',
                icon: Icons.timelapse_rounded,
              ),
            ],
          ),
          const SizedBox(height: 20),
          SectionCard(
            title: 'Priority list',
            children: [
              for (final task in data!['tasks'])
                ListTile(
                  contentPadding: EdgeInsets.zero,
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
    super.key,
  });
  final String label, value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon),
            const SizedBox(height: 18),
            Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            Text(label),
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

  Future<void> done(Map task) async {
    await widget.api.request(
      '/tasks/${task['_id']}',
      method: 'PATCH',
      body: {'status': 'done'},
    );
    load();
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
          Text(
            'My tasks',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (error != null) ErrorBox(error!),
          if (loading)
            const Center(child: CircularProgressIndicator())
          else if (tasks.isEmpty)
            const EmptyCopy('No tasks yet. Create your first task.')
          else
            for (final task in tasks)
              Card(
                child: ListTile(
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
                  ),
                  trailing: PriorityChip(task['priority']),
                ),
              ),
        ],
      ),
    ),
  );
}

class BillsTab extends StatefulWidget {
  const BillsTab({required this.api, super.key});
  final ApiClient api;
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
      builder: (_) => const BillSheet(),
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
          Text(
            'Bills & reminders',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (error != null) ErrorBox(error!),
          if (loading)
            const Center(child: CircularProgressIndicator())
          else if (bills.isEmpty)
            const EmptyCopy('No reminders yet. Add your first bill.')
          else
            for (final bill in bills)
              Card(
                child: ListTile(
                  minVerticalPadding: 14,
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text(
                    bill['name'],
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(
                    'Due ${DateTime.parse(bill['dueDate']).toLocal().toString().split(' ').first}',
                  ),
                  trailing: Text(
                    '₱${(bill['amount'] as num).toStringAsFixed(2)}',
                    style: const TextStyle(fontWeight: FontWeight.w800),
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
  final brief = TextEditingController();
  List plan = [];
  bool busy = false;
  String? error;
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
      Text(
        'Project planner',
        style: Theme.of(
          context,
        ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 6),
      Text(
        'Turn a brief into editable tasks.',
        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
      ),
      const SizedBox(height: 18),
      TextField(
        controller: brief,
        minLines: 6,
        maxLines: 10,
        decoration: const InputDecoration(
          labelText: 'Project brief',
          alignLabelWithHint: true,
          hintText: 'Describe requirements, outputs, and constraints.',
        ),
      ),
      const SizedBox(height: 14),
      if (error != null) ErrorBox(error!),
      FilledButton.icon(
        onPressed: busy ? null : generate,
        icon: const Icon(Icons.auto_awesome_rounded),
        label: Text(busy ? 'Preparing...' : 'Generate plan'),
      ),
      if (plan.isNotEmpty) ...[
        const SizedBox(height: 20),
        SectionCard(
          title: 'Draft plan',
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

class ChatTab extends StatefulWidget {
  const ChatTab({required this.api, super.key});
  final ApiClient api;
  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  List conversations = [], messages = [];
  Map? active;
  final text = TextEditingController();
  String? error;
  bool loading = true;
  @override
  void initState() {
    super.initState();
    loadConversations();
  }

  Future<void> loadConversations() async {
    try {
      conversations = await widget.api.request('/conversations');
      if (conversations.isNotEmpty) {
        active = conversations.first;
        await loadMessages();
      }
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
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

  @override
  Widget build(BuildContext context) => Column(
    children: [
      if (conversations.length > 1)
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              for (final item in conversations)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('#${item['name']}'),
                    selected: active?['_id'] == item['_id'],
                    onSelected: (_) {
                      setState(() => active = item);
                      loadMessages();
                    },
                  ),
                ),
            ],
          ),
        ),
      Expanded(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : active == null
            ? const EmptyCopy(
                'Create a team on the More tab to start chatting.',
              )
            : RefreshIndicator(
                onRefresh: loadMessages,
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    if (error != null) ErrorBox(error!),
                    for (final message in messages)
                      Align(
                        alignment: message['senderType'] == 'ai'
                            ? Alignment.centerLeft
                            : Alignment.centerRight,
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 340),
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: message['senderType'] == 'ai'
                                ? Theme.of(
                                    context,
                                  ).colorScheme.secondaryContainer
                                : Theme.of(
                                    context,
                                  ).colorScheme.primaryContainer,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                message['senderType'] == 'ai'
                                    ? 'Kaya'
                                    : message['sender']?['displayName'] ??
                                          message['senderName'] ??
                                          'Member',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(message['content']),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(12),
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

class MoreTab extends StatelessWidget {
  const MoreTab({
    required this.api,
    required this.user,
    required this.onLogout,
    required this.onTheme,
    super.key,
  });
  final ApiClient api;
  final Map<String, dynamic> user;
  final VoidCallback onLogout, onTheme;
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
      Text(
        'More',
        style: Theme.of(
          context,
        ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 16),
      Card(
        child: Column(
          children: [
            ListTile(
              minVerticalPadding: 12,
              leading: const Icon(Icons.receipt_long_outlined),
              title: const Text('Bills & reminders'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  open(context, 'Bills & reminders', BillsTab(api: api)),
            ),
            const Divider(height: 1),
            ListTile(
              minVerticalPadding: 12,
              leading: const Icon(Icons.groups_outlined),
              title: const Text('Teams'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => open(context, 'Teams', TeamsPage(api: api)),
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
                SettingsTab(user: user, onLogout: onLogout, onTheme: onTheme),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class TeamsPage extends StatefulWidget {
  const TeamsPage({required this.api, super.key});
  final ApiClient api;
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

class SettingsTab extends StatelessWidget {
  const SettingsTab({
    required this.user,
    required this.onLogout,
    required this.onTheme,
    super.key,
  });
  final Map<String, dynamic> user;
  final VoidCallback onLogout, onTheme;
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
              title: Text(user['displayName']),
              subtitle: Text(user['email']),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.contrast_rounded),
              title: const Text('Switch light or dark mode'),
              onTap: onTheme,
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
              onTap: onLogout,
            ),
          ],
        ),
      ),
    ],
  );
}

class TaskSheet extends StatefulWidget {
  const TaskSheet({super.key});
  @override
  State<TaskSheet> createState() => _TaskSheetState();
}

class _TaskSheetState extends State<TaskSheet> {
  final key = GlobalKey<FormState>(),
      title = TextEditingController(),
      project = TextEditingController(text: 'Personal');
  String priority = 'medium';
  @override
  Widget build(BuildContext context) => FormSheet(
    title: 'Create task',
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
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () {
              if (key.currentState!.validate()) {
                Navigator.pop(context, {
                  'title': title.text,
                  'project': project.text,
                  'taskType': 'personal',
                  'priority': priority,
                });
              }
            },
            child: const Text('Create task'),
          ),
        ],
      ),
    ),
  );
}

class BillSheet extends StatefulWidget {
  const BillSheet({super.key});
  @override
  State<BillSheet> createState() => _BillSheetState();
}

class _BillSheetState extends State<BillSheet> {
  final key = GlobalKey<FormState>(),
      name = TextEditingController(),
      amount = TextEditingController(),
      due = TextEditingController();
  @override
  Widget build(BuildContext context) => FormSheet(
    title: 'Add bill reminder',
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
          TextFormField(
            controller: amount,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Amount'),
            validator: (v) => double.tryParse(v ?? '') == null
                ? 'Enter a valid amount'
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
                  'dueDate': due.text,
                  'category': 'Other',
                });
              }
            },
            child: const Text('Save reminder'),
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

class SectionCard extends StatelessWidget {
  const SectionCard({required this.title, required this.children, super.key});
  final String title;
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
  Widget build(BuildContext context) =>
      Chip(label: Text(value), visualDensity: VisualDensity.compact);
}

class EmptyCopy extends StatelessWidget {
  const EmptyCopy(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 48),
    child: Column(
      children: [
        Icon(
          Icons.inbox_outlined,
          size: 36,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
        const SizedBox(height: 12),
        Text(text, textAlign: TextAlign.center),
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
    ),
    child: Text(
      text,
      style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
    ),
  );
}
