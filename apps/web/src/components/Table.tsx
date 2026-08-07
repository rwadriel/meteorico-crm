import { EmptyState } from './EmptyState.js';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'Nenhum registro encontrado',
}: TableProps<T>) {
  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(item) : String(item[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
