// Todo lo que sale hacia la API pasa por acá. Una sola forma de fallar y un
// solo lugar donde cambiar la base si algún día deja de ser el mismo origen.

export interface Categoria {
  id: string;
  name: string;
  icon: string;
  color: string;
  isSystem: boolean;
}

export interface Movimiento {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  description: string;
  category: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  date: string;
  installmentId?: string;
}

export interface Plan {
  id: string;
  description: string;
  totalAmount: number;
  installmentCount: number;
  paidCount: number;
  startDate: string;
  status: string;
  category: string | null;
}

export interface Cuota {
  id: string;
  number: number;
  amount: number;
  date: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
}

/** Error con el texto que la API mandó en `problem+json`, para poder mostrarlo
 *  tal cual en vez de inventar un "algo salió mal". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly campo?: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError("No se pudo hablar con el servidor. ¿Está corriendo la API?");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detalle = body?.errors?.[0];
    throw new ApiError(
      detalle ? `${body.title}: ${detalle.message}` : (body?.title ?? `Error ${res.status}`),
      detalle?.path,
    );
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  categorias: () => req<Categoria[]>("/categories"),
  movimientos: (desde?: string, hasta?: string) => {
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    const s = q.toString();
    return req<Movimiento[]>(`/movements${s ? `?${s}` : ""}`);
  },
  confirmar: (id: string) => req<{ id: string }>(`/movements/${id}/confirm`, { method: "POST" }),
  planes: () => req<Plan[]>("/installment-plans"),
  cuotas: (planId: string) => req<Cuota[]>(`/installment-plans/${planId}/installments`),
  crearPlan: (input: {
    type: "INCOME" | "EXPENSE";
    description: string;
    category: string;
    totalAmount: number;
    installmentCount: number;
    startDate: string;
  }) =>
    req<{ plan: Plan; installments: Cuota[] }>("/installment-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};
