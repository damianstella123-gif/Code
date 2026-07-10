/*
# Add category-specific detail columns to suppliers

1. Modified Tables
   - `suppliers`: Added ~80 new columns organized by supplier category

2. New Columns by Category
   - **Location**: loc_tipo, loc_capienza_teatro/cocktail/banquetto/cabaret, loc_mq, loc_outdoor/indoor/rooftop/parcheggio/esclusiva/catering_interno, loc_note_tecniche
   - **Audio Video**: av_tipologie[], av_marchi, av_led_wall/streaming/regia/montaggio_incluso, av_led_wall_mq, av_note
   - **Catering**: cat_stile, cat_min_pax/max_pax, cat_servizio_tavolo/buffet/finger_food/bio/km0/allergie_gestite/beverage/personale_incluso
   - **DMC**: dmc_paesi[]/lingue[]/specialita[], dmc_anni_esperienza, dmc_iata/incentive/congressi/team_building
   - **Transfer**: tr_flotta_auto/minivan/bus/pullman, tr_lingue_autisti[], tr_ncc/vip/h24
   - **Staff**: stf_ruoli[]/lingue[], stf_min_ordine, stf_hostess/steward/promoter/interpreti/divisa
   - **Agenzia Viaggi**: ag_iata, ag_vettori[]/destinazioni[], ag_biglietteria_aerea/treno/pacchetti/mice
   - **Allestimenti**: all_tipologie[], all_montaggio_incluso/noleggio/vendita/grafica_inclusa, all_min_budget
   - **Experience**: exp_tipologia, exp_min_pax/max_pax/durata_minuti, exp_outdoor/indoor, exp_stagionalita[]/lingue[]

3. Security
   - No RLS changes (existing policies cover these columns automatically)

4. Notes
   - All columns are nullable or have sensible defaults
   - Array columns use text[] type for flexibility
   - Boolean columns default to false unless the positive case is standard
*/

ALTER TABLE suppliers
  -- LOCATION
  ADD COLUMN IF NOT EXISTS loc_tipo text,
  ADD COLUMN IF NOT EXISTS loc_capienza_teatro int,
  ADD COLUMN IF NOT EXISTS loc_capienza_cocktail int,
  ADD COLUMN IF NOT EXISTS loc_capienza_banquetto int,
  ADD COLUMN IF NOT EXISTS loc_capienza_cabaret int,
  ADD COLUMN IF NOT EXISTS loc_mq int,
  ADD COLUMN IF NOT EXISTS loc_outdoor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loc_indoor boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS loc_rooftop boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loc_parcheggio boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loc_esclusiva boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loc_catering_interno boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loc_note_tecniche text,

  -- AUDIO VIDEO
  ADD COLUMN IF NOT EXISTS av_tipologie text[],
  ADD COLUMN IF NOT EXISTS av_marchi text,
  ADD COLUMN IF NOT EXISTS av_led_wall boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS av_led_wall_mq numeric,
  ADD COLUMN IF NOT EXISTS av_streaming boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS av_regia boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS av_montaggio_incluso boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS av_note text,

  -- CATERING
  ADD COLUMN IF NOT EXISTS cat_stile text,
  ADD COLUMN IF NOT EXISTS cat_min_pax int,
  ADD COLUMN IF NOT EXISTS cat_max_pax int,
  ADD COLUMN IF NOT EXISTS cat_servizio_tavolo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat_buffet boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat_finger_food boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat_bio boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat_km0 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat_allergie_gestite boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cat_beverage boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat_personale_incluso boolean DEFAULT false,

  -- DMC
  ADD COLUMN IF NOT EXISTS dmc_paesi text[],
  ADD COLUMN IF NOT EXISTS dmc_lingue text[],
  ADD COLUMN IF NOT EXISTS dmc_specialita text[],
  ADD COLUMN IF NOT EXISTS dmc_anni_esperienza int,
  ADD COLUMN IF NOT EXISTS dmc_iata boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dmc_incentive boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dmc_congressi boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dmc_team_building boolean DEFAULT false,

  -- TRANSFER
  ADD COLUMN IF NOT EXISTS tr_flotta_auto int,
  ADD COLUMN IF NOT EXISTS tr_flotta_minivan int,
  ADD COLUMN IF NOT EXISTS tr_flotta_bus int,
  ADD COLUMN IF NOT EXISTS tr_flotta_pullman int,
  ADD COLUMN IF NOT EXISTS tr_lingue_autisti text[],
  ADD COLUMN IF NOT EXISTS tr_ncc boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tr_vip boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tr_h24 boolean DEFAULT false,

  -- STAFF
  ADD COLUMN IF NOT EXISTS stf_ruoli text[],
  ADD COLUMN IF NOT EXISTS stf_lingue text[],
  ADD COLUMN IF NOT EXISTS stf_min_ordine int,
  ADD COLUMN IF NOT EXISTS stf_hostess boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stf_steward boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stf_promoter boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stf_interpreti boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stf_divisa boolean DEFAULT false,

  -- AGENZIA VIAGGI
  ADD COLUMN IF NOT EXISTS ag_iata boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ag_vettori text[],
  ADD COLUMN IF NOT EXISTS ag_destinazioni text[],
  ADD COLUMN IF NOT EXISTS ag_biglietteria_aerea boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ag_biglietteria_treno boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ag_pacchetti boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ag_mice boolean DEFAULT false,

  -- ALLESTIMENTI
  ADD COLUMN IF NOT EXISTS all_tipologie text[],
  ADD COLUMN IF NOT EXISTS all_montaggio_incluso boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS all_noleggio boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_vendita boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_grafica_inclusa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_min_budget numeric,

  -- EXPERIENCE
  ADD COLUMN IF NOT EXISTS exp_tipologia text,
  ADD COLUMN IF NOT EXISTS exp_min_pax int,
  ADD COLUMN IF NOT EXISTS exp_max_pax int,
  ADD COLUMN IF NOT EXISTS exp_durata_minuti int,
  ADD COLUMN IF NOT EXISTS exp_outdoor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS exp_indoor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS exp_stagionalita text[],
  ADD COLUMN IF NOT EXISTS exp_lingue text[];
