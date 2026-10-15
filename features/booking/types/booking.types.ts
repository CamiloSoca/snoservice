export interface Service {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description?: string;
}

export interface Barber {
  id: string;
  name: string;
  avatarUrl?: string;
  available: boolean;
}

export interface TimeSlot {
  time: string; // ej: "10:30"
  available: boolean;
}

export interface CustomerData {
  fullName: string;
  phone: string;
  notes?: string;
  paymentMethod: 'onsite' | 'online';
}

export interface BookingState {
  step: number; // 1: Servicio, 2: Barbero, 3: Fecha/Hora, 4: Datos
  selectedService: Service | null;
  selectedBarber: Barber | null;
  selectedDate: string | null; // "YYYY-MM-DD"
  selectedTimeSlot: string | null; // "14:00"
  customer: CustomerData;
}