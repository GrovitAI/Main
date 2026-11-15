module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
        },
      ],
      // Task 309: only the icons in use ship, not the whole icon set.
      './babel/lucide-icon-imports',
      'react-native-reanimated/plugin',
    ],
  };
};
