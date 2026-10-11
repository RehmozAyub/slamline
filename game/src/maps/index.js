import coast from './coast.js';
import city from './city.js';
import alpine from './alpine.js';
import snow from './snow.js';
import canyon from './canyon.js';
import jungle from './jungle.js';
import canal from './canal.js';
import space from './space.js';

coast.weatherLabel ??= 'CLEAR';
city.weatherLabel ??= 'NIGHT';
alpine.weatherLabel ??= 'SUNNY';

export const MAPS = [coast, city, alpine, snow, canyon, jungle, canal, space];
export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));
