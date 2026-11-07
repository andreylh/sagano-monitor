// Checks whether the Sagano Romantic Train has 2 seats (Arashiyama -> Kameoka) on 2026-11-19
// using the booking site's own inventory API, and notifies via ntfy.sh.
// A FAILED run means "seats found": GitHub then emails the repo owner as a backup alert.
const API = 'https://common-api.sagano.linktivity.io/v1/search-inventory';
const BOOK = 'https://file.sagano.linktivity.io/seat/51/down?lang=en&date=2026-11-19&unitsCount=2&backUrl=https%3A%2F%2Fars-saganokanko.triplabo.jp%2Factivity%2Fen%2FLINKTIVITY-YRBTL&redirectUrl=https%3A%2F%2Fars-saganokanko.triplabo.jp%2Fbooking%2Fpay&currentStep=station';
const DATE = '2026-11-19';
const SEATS = 2;
const FROM = '2'; // Torokko Arashiyama
const TO = '4';   // Torokko Kameoka
const TOPIC = process.env.NTFY_TOPIC;

const todayJST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
if (todayJST > DATE) {
  console.log(`Date ${DATE} has passed — nothing to do. Disable this workflow.`);
  process.exit(0);
}

const timeBR = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

async function notify(title, message, priority = 'low', tags = 'train') {
  if (!TOPIC) { console.log('NTFY_TOPIC not set; skipping push:', title); return; }
  try {
    await fetch(`https://ntfy.sh/${TOPIC}`, {
      method: 'POST',
      body: message,
      headers: { Title: title, Priority: priority, Tags: tags, Click: BOOK },
    });
  } catch (e) { console.log('ntfy push failed:', e.message); }
}

try {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date: DATE, from_station_id: FROM, to_station_id: TO, total: SEATS, product_id: '51' }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data.services) || data.services.length === 0) throw new Error('No services in response');

  const available = data.services.filter(s => s.available).map(s => s.departure_hhmm);
  console.log(data.services.map(s => `${s.departure_hhmm}:${s.available ? 'OK' : 'x'}`).join(' '));

  if (available.length === 0) {
    console.log(`19/11 (${SEATS} lugares): esgotado`);
    await notify('Sagano 19/11: esgotado', `Checado às ${timeBR()}. Nenhum horário com ${SEATS} lugares (Arashiyama → Kameoka).`, 'low', 'hourglass');
  } else {
    const times = available.join(', ');
    console.log(`19/11 (${SEATS} lugares): DISPONÍVEL ${times}`);
    await notify('🚂 Sagano 19/11: 2 LUGARES!', `Arashiyama → Kameoka, horário(s): ${times} (${timeBR()}). Toque para reservar já!`, 'urgent', 'rotating_light,train');
    console.log(`::error::SAGANO 19/11 - ${SEATS} LUGARES DISPONIVEIS: ${times} - reserve ja`);
    process.exitCode = 1;
  }
} catch (e) {
  console.log(`::warning::Could not check availability: ${e.message}`);
  await notify('Sagano 19/11: falha na checagem', `Checado às ${timeBR()}. Erro: ${e.message}. Tento de novo na próxima.`, 'low', 'warning');
}
