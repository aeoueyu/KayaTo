import 'package:flutter/material.dart';

import 'kayato_toast.dart';

void main() => runApp(const KayaToApp());

class KayaToApp extends StatefulWidget {
  const KayaToApp({super.key});

  @override
  State<KayaToApp> createState() => _KayaToAppState();
}

class _KayaToAppState extends State<KayaToApp> {
  ThemeMode _themeMode = ThemeMode.system;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'KayaTo Toasts',
      debugShowCheckedModeBanner: false,
      themeMode: _themeMode,
      theme: _theme(Brightness.light),
      darkTheme: _theme(Brightness.dark),
      builder: (context, child) => KayaToaster(child: child!),
      home: ToastShowcase(
        onThemeChanged: () => setState(() {
          _themeMode = _themeMode == ThemeMode.dark
              ? ThemeMode.light
              : ThemeMode.dark;
        }),
      ),
    );
  }
}

ThemeData _theme(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  const ruby = Color(0xFF70000E);
  const pearl = Color(0xFFF5F4F2);
  const coolGray = Color(0xFFDCD7D4);
  const creme = Color(0xFFC3B79D);
  const meteorite = Color(0xFF2C2929);
  const ink = Color(0xFF030303);
  final scheme = ColorScheme.fromSeed(
    seedColor: ruby,
    brightness: brightness,
    primary: isDark ? const Color(0xFFB8293B) : ruby,
    surface: isDark ? const Color(0xFF171515) : const Color(0xFFFCFBFA),
    error: isDark ? const Color(0xFFE26F7D) : ruby,
  ).copyWith(
    onPrimary: pearl,
    secondary: isDark ? coolGray : meteorite,
    onSecondary: isDark ? ink : pearl,
    surfaceContainerLow: isDark ? const Color(0xFF171515) : pearl,
    surfaceContainer: isDark ? meteorite : const Color(0xFFE9E5E2),
    surfaceContainerHigh: isDark ? const Color(0xFF393535) : coolGray,
    outline: isDark ? const Color(0xFF655F5F) : const Color(0xFF9C9490),
    outlineVariant: isDark ? const Color(0xFF4B4646) : const Color(0xFFD0C9C5),
  );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: isDark
        ? ink
        : pearl,
    textTheme: ThemeData(brightness: brightness).textTheme.apply(
      bodyColor: isDark ? pearl : meteorite,
      displayColor: isDark ? pearl : ink,
    ),
    dividerColor: isDark ? const Color(0xFF4B4646) : coolGray,
    cardColor: isDark ? const Color(0xFF171515) : const Color(0xFFFCFBFA),
    splashColor: ruby.withValues(alpha: 0.12),
    highlightColor: creme.withValues(alpha: 0.16),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(44, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(44, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}

class ToastShowcase extends StatelessWidget {
  const ToastShowcase({required this.onThemeChanged, super.key});

  final VoidCallback onThemeChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('KayaTo notifications'),
        actions: [
          IconButton(
            onPressed: onThemeChanged,
            tooltip: 'Switch light or dark mode',
            icon: const Icon(Icons.contrast_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Card(
                elevation: 0,
                color: colors.surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                  side: BorderSide(color: colors.outlineVariant),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Flutter toast system',
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Native Flutter implementation with stacking, actions, promise states, swipe dismissal, accessibility, and dark mode.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          height: 1.5,
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 24),
                      _DemoButton(
                        label: 'Show success',
                        icon: Icons.check_circle_outline_rounded,
                        onPressed: () => kayaToast.success(
                          'Task created',
                          description:
                              'Mobile onboarding was added to your board.',
                        ),
                      ),
                      _DemoButton(
                        label: 'Show error',
                        icon: Icons.error_outline_rounded,
                        onPressed: () => kayaToast.error(
                          'Upload failed',
                          description: 'Check your connection and try again.',
                        ),
                      ),
                      _DemoButton(
                        label: 'Show warning with action',
                        icon: Icons.warning_amber_rounded,
                        onPressed: () => kayaToast.show(
                          'Deadline is tomorrow',
                          description:
                              'Two checklist items are still incomplete.',
                          type: KayaToastType.warning,
                          action: KayaToastAction(
                            label: 'Open task',
                            onPressed: () {},
                          ),
                        ),
                      ),
                      _DemoButton(
                        label: 'Run promise toast',
                        icon: Icons.sync_rounded,
                        onPressed: () {
                          kayaToast.promise<String>(
                            Future<String>.delayed(
                              const Duration(seconds: 2),
                              () => 'Project plan generated',
                            ),
                            loading: 'Kaya is preparing your plan',
                            success: (result) => result,
                            error: (_) => 'Could not generate the plan',
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DemoButton extends StatelessWidget {
  const _DemoButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(label),
      ),
    );
  }
}
