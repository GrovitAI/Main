/// <reference types="expo/types" />
// expo-env.d.ts carries this reference too, but Expo generates it and it is
// gitignored, so a clean checkout such as CI would otherwise miss Expo's type
// augmentations (Pressable's hovered state among them).
declare module '*.css';
