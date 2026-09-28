/** Se muestra cuando falta una variable de entorno: dice cuál y dónde ponerla. */
export function ConfigNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="panel mt-10 p-5 sm:p-6">
      <p className="text-sm text-amber">Falta configurar el servidor</p>
      <p className="mt-2">{message}</p>
    </div>
  );
}
