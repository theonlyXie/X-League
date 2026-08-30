// Reanimated 4 needs the worklets Babel plugin, and `babel-preset-expo`
// configures it. The project ran without this file because Metro applies the
// preset by default; it is written down now because a missing plugin does not
// degrade — worklets throw "Failed to create a worklet" at runtime on device,
// which is exactly the failure that would not show up on web.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
