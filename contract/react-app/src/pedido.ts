// The code under test: one function with a real name, in its own file, so a
// source-mapped frame has a filename, a line and a function name to prove.

export interface Item {
  nome: string;
  preco: number;
  quantidade: number;
}

export function calcularTotalPedido(itens: Item[]): number {
  if (itens.length === 0) {
    throw new TypeError('pedido sem itens: total indefinido (cliente 529.982.247-25)');
  }
  return itens.reduce((total, item) => total + item.preco * item.quantidade, 0);
}

export async function confirmarPedido(id: string): Promise<never> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  throw new Error(`pedido ${id} recusado pelo gateway de ana@example.com`);
}
