// The error guard has to be in place before the route files load, so it comes first.
import './src/lib/pos/startup-error-guard';
import 'expo-router/entry';
