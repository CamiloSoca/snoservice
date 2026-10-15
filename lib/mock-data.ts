export const mockShop = {
  id: '11111111-1111-1111-1111-111111111113',
  slug: '13cut',
  name: '13´Cut',
  address: 'Avenida Agraciada 3778, Montevideo',
  phone: '098509376',
  primary_color: '#000000'
};

export const mockServices = [
  { id: 's1', name: 'Corte', price: 400, duration_minutes: 60 },
  { id: 's2', name: 'Corte & Barba', price: 500, duration_minutes: 60 },
  { id: 's3', name: 'Mechas', price: 1400, duration_minutes: 60 },
  { id: 's4', name: 'Color Global', price: 2500, duration_minutes: 60 }
];

export const mockBarbers = [
  { id: 'b1', name: 'Nahuel', commission_rate: 100, pin: '1313' },
  { id: 'b2', name: 'Emanuel', commission_rate: 50, pin: '1111' },
  { id: 'b3', name: 'Alexander', commission_rate: 50, pin: '2222' }
];

export const mockSchedule = {
  1: { open: '09:00', close: '20:00' }, // Lunes
  2: { open: '09:00', close: '22:00' }, // Martes
  3: { open: '10:00', close: '19:00' }, // Miércoles
  4: { open: '10:00', close: '19:00' }, // Jueves
  5: { open: '10:00', close: '19:00' }, // Viernes
  6: { open: '09:00', close: '18:00' }, // Sábado
  0: { closed: true }                   // Domingo
};