export function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
