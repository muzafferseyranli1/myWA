// Move by database ID: a filtered column's visible index is not the source index.
export function moveTaskById(columns: any, id: string, source: string, destination: string, index: number) {
  const task = columns[source].tasks.find((t: any) => t.id === id);
  if (!task) return columns;
  const target = [...columns[destination].tasks];
  target.splice(index, 0, { ...task, status: destination });
  return { ...columns, [source]: { ...columns[source], tasks: columns[source].tasks.filter((t: any) => t.id !== id) }, [destination]: { ...columns[destination], tasks: target } };
}
