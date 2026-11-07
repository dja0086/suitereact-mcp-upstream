// Demo data for the data-viewer capture. Mirrors getTableRowsFromSuiteql's
// { headers, rows } shape; COUNT queries get { rows: [{ cnt }] }.
const companies = [
  ['Northwind Traders', 'Seattle'],
  ['Contoso Pharma', 'Boston'],
  ['Fabrikam Robotics', 'Austin'],
  ['Tailspin Toys', 'Denver'],
  ['Wide World Importers', 'Miami'],
  ['Adventure Works', 'Portland'],
  ['Litware Labs', 'Chicago'],
  ['Proseware Inc', 'Atlanta'],
  ['Woodgrove Bank', 'New York'],
  ['Alpine Ski House', 'Salt Lake City'],
  ['Coho Winery', 'Napa'],
  ['Blue Yonder Air', 'Dallas'],
  ['Lamna Healthcare', 'Phoenix'],
  ['Margie Travel', 'San Diego'],
  ['Relecloud', 'San Jose'],
  ['Trey Research', 'Raleigh'],
  ['VanArsdel Ltd', 'Minneapolis'],
  ['Humongous Insurance', 'Hartford'],
];
const status = ['Customer-Closed Won', 'Customer-Renewal', 'Customer-Upsell'];
const rows = companies.map(([name, city], i) => ({
  id: 1040 + i * 7,
  entityid: `CUST-${String(1040 + i * 7).padStart(5, '0')}`,
  companyname: name,
  email: `ap@${name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
  phone: `(${200 + i * 37}) 555-0${100 + i * 13}`,
  status: { label: status[i % 3], value: i % 3 },
  datecreated: `${String((i % 12) + 1).padStart(2, '0')}/${String(((i * 3) % 28) + 1).padStart(2, '0')}/2026`,
  city,
}));
const headers = Object.keys(rows[0]).map(id => ({ id, label: id }));

export default async function handler({ body }) {
  const q = String(body?.inputData?.query || '');
  if (/COUNT\(\*\)/i.test(q)) return { rows: [{ cnt: rows.length }] };
  if (/customer/i.test(q)) return { headers, rows };
  return { headers, rows: [] };
}
