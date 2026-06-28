export interface ProductWithStock {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stock: {
    warehouseId: string;
    warehouseName: string;
    available: number;
    total: number;
  }[];
}

export interface ReservationDetail {
  id: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  quantity: number;
  expiresAt: string;
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl: string | null;
  };
  warehouse: {
    id: string;
    name: string;
  };
}