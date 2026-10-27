export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action() {
  return new Response("Method not allowed", { status: 405 });
}
