/*
# Backfill supplier regions from city names

Updates existing suppliers that have a city but no region by inferring the region
from the city name. Only applies to Italian suppliers (country is Italia, IT, or empty).

1. Modified Tables
   - `suppliers`: Sets `region` based on city for rows where region is null/empty.

2. Important Notes
   - Only updates rows where country is Italian or unset.
   - Foreign cities (Parigi, Ibiza, etc.) are skipped.
   - Uses ILIKE for case-insensitive partial matching.
*/

UPDATE suppliers SET region = CASE
  WHEN city ILIKE '%Milano%' THEN 'Lombardia'
  WHEN city ILIKE '%Bergamo%' THEN 'Lombardia'
  WHEN city ILIKE '%Brescia%' THEN 'Lombardia'
  WHEN city ILIKE '%Como%' THEN 'Lombardia'
  WHEN city ILIKE '%Monza%' THEN 'Lombardia'
  WHEN city ILIKE '%Pavia%' THEN 'Lombardia'
  WHEN city ILIKE '%Varese%' THEN 'Lombardia'
  WHEN city ILIKE '%Lecco%' THEN 'Lombardia'
  WHEN city ILIKE '%Roma%' THEN 'Lazio'
  WHEN city ILIKE '%Frosinone%' THEN 'Lazio'
  WHEN city ILIKE '%Latina%' THEN 'Lazio'
  WHEN city ILIKE '%Napoli%' THEN 'Campania'
  WHEN city ILIKE '%Salerno%' THEN 'Campania'
  WHEN city ILIKE '%Caserta%' THEN 'Campania'
  WHEN city ILIKE '%Torino%' THEN 'Piemonte'
  WHEN city ILIKE '%Cuneo%' THEN 'Piemonte'
  WHEN city ILIKE '%Asti%' THEN 'Piemonte'
  WHEN city ILIKE '%Novara%' THEN 'Piemonte'
  WHEN city ILIKE '%Firenze%' THEN 'Toscana'
  WHEN city ILIKE '%Siena%' THEN 'Toscana'
  WHEN city ILIKE '%Pisa%' THEN 'Toscana'
  WHEN city ILIKE '%Lucca%' THEN 'Toscana'
  WHEN city ILIKE '%Arezzo%' THEN 'Toscana'
  WHEN city ILIKE '%Bologna%' THEN 'Emilia-Romagna'
  WHEN city ILIKE '%Modena%' THEN 'Emilia-Romagna'
  WHEN city ILIKE '%Parma%' THEN 'Emilia-Romagna'
  WHEN city ILIKE '%Reggio Emilia%' THEN 'Emilia-Romagna'
  WHEN city ILIKE '%Rimini%' THEN 'Emilia-Romagna'
  WHEN city ILIKE '%Venezia%' THEN 'Veneto'
  WHEN city ILIKE '%Verona%' THEN 'Veneto'
  WHEN city ILIKE '%Padova%' THEN 'Veneto'
  WHEN city ILIKE '%Vicenza%' THEN 'Veneto'
  WHEN city ILIKE '%Treviso%' THEN 'Veneto'
  WHEN city ILIKE '%Palermo%' THEN 'Sicilia'
  WHEN city ILIKE '%Catania%' THEN 'Sicilia'
  WHEN city ILIKE '%Messina%' THEN 'Sicilia'
  WHEN city ILIKE '%Bari%' THEN 'Puglia'
  WHEN city ILIKE '%Lecce%' THEN 'Puglia'
  WHEN city ILIKE '%Taranto%' THEN 'Puglia'
  WHEN city ILIKE '%Foggia%' THEN 'Puglia'
  WHEN city ILIKE '%Cagliari%' THEN 'Sardegna'
  WHEN city ILIKE '%Sassari%' THEN 'Sardegna'
  WHEN city ILIKE '%Olbia%' THEN 'Sardegna'
  WHEN city ILIKE '%Porto Cervo%' THEN 'Sardegna'
  WHEN city ILIKE '%Arzachena%' THEN 'Sardegna'
  WHEN city ILIKE '%Chia Laguna%' THEN 'Sardegna'
  WHEN city ILIKE '%Genova%' THEN 'Liguria'
  WHEN city ILIKE '%La Spezia%' THEN 'Liguria'
  WHEN city ILIKE '%Portofino%' THEN 'Liguria'
  WHEN city ILIKE '%Savona%' THEN 'Liguria'
  WHEN city ILIKE '%Ancona%' THEN 'Marche'
  WHEN city ILIKE '%Pesaro%' THEN 'Marche'
  WHEN city ILIKE '%Perugia%' THEN 'Umbria'
  WHEN city ILIKE '%Terni%' THEN 'Umbria'
  WHEN city ILIKE '%Pescara%' THEN 'Abruzzo'
  WHEN city ILIKE '%L''Aquila%' THEN 'Abruzzo'
  WHEN city ILIKE '%Trieste%' THEN 'Friuli-Venezia Giulia'
  WHEN city ILIKE '%Udine%' THEN 'Friuli-Venezia Giulia'
  WHEN city ILIKE '%Trento%' THEN 'Trentino-Alto Adige'
  WHEN city ILIKE '%Bolzano%' THEN 'Trentino-Alto Adige'
  WHEN city ILIKE '%Merano%' THEN 'Trentino-Alto Adige'
  WHEN city ILIKE '%Aosta%' THEN 'Valle d''Aosta'
  WHEN city ILIKE '%Courmayeur%' THEN 'Valle d''Aosta'
  WHEN city ILIKE '%Campobasso%' THEN 'Molise'
  WHEN city ILIKE '%Potenza%' THEN 'Basilicata'
  WHEN city ILIKE '%Matera%' THEN 'Basilicata'
  WHEN city ILIKE '%Reggio Calabria%' THEN 'Calabria'
  WHEN city ILIKE '%Catanzaro%' THEN 'Calabria'
  WHEN city ILIKE '%Cosenza%' THEN 'Calabria'
  ELSE region
END
WHERE (region IS NULL OR region = '')
AND (country IS NULL OR country = '' OR country ILIKE 'Italia' OR country = 'IT')
AND city IS NOT NULL AND city != '';
