/** @type {import("esbuild").BuildOptions} */
export default {
  define: {
    "process.env.DEFINED_VIA_CONFIG": JSON.stringify("works"),
  },
};
