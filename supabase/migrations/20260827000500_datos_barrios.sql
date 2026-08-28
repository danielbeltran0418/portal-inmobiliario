INSERT INTO public.barrios (nombre, slug, ciudad) VALUES
  ('Villa Carolina',   'villa-carolina',   'Barranquilla'),
  ('El Paraiso',       'el-paraiso',       'Barranquilla'),
  ('Alto Prado',       'alto-prado',       'Barranquilla'),
  ('Riomar',           'riomar',           'Barranquilla'),
  ('El Prado',         'el-prado',         'Barranquilla'),
  ('Villa Santos',     'villa-santos',     'Barranquilla'),
  ('Ciudad Jardin',    'ciudad-jardin',    'Barranquilla'),
  ('Boston',           'boston',           'Barranquilla'),
  ('La Concepcion',    'la-concepcion',    'Barranquilla'),
  ('Miramar',          'miramar',          'Barranquilla')
ON CONFLICT (slug) DO NOTHING;
