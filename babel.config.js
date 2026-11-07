module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo は react-native-worklets があると自動で plugin を足すので、
    // 二重にかからないよう自動の方を切り、ここで明示的に足す（最後に置く決まり）
    presets: [['babel-preset-expo', { worklets: false }]],
    plugins: ['react-native-worklets/plugin'],
  };
};
