// The test Worker's main module. The app's real entry imports React Router's build, which tests cannot load, and the
// plugin needs every Durable Object class exported from main.
export { RestTimer } from "../../app/server/rest-timer.server";

export default {
  async fetch() {
    return new Response("test worker");
  },
} satisfies ExportedHandler<Env>;
