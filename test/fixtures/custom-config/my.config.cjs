/** @type {import("esbuild").BuildOptions} */
module.exports = {
  define: {
    "process.env.DEFINED_VIA_CONFIG": JSON.stringify("works"),
  },
};
