/**
 * Reads an action's form body. A body that is not a form, which no page of
 * ours sends but a script posting JSON to `/ingresar` does, is a 400 the
 * boundary renders rather than an unexpected error with its alert:
 * `request.formData()` throws a `TypeError` for it.
 */
export async function readFormData(request: Request): Promise<FormData> {
  // A body read twice also throws a `TypeError`, and that one is our bug.
  const unread = !request.bodyUsed;

  try {
    return await request.formData();
  } catch (error) {
    if (unread && error instanceof TypeError) {
      throw new Response("El formulario no se pudo leer.", { status: 400 });
    }

    throw error;
  }
}
