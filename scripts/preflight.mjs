import fs from 'node:fs';
import { configurations } from '../dist/config/configurations.js';
import { validateAllConfigurations } from '../dist/config/validate.js';

validateAllConfigurations(configurations);
for (const key of ['DATABASE_URL','JWT_SECRET']) if (!process.env[key]) throw new Error(`${key} is required`);
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) throw new Error('CORS_ORIGINS must be set in production');
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_METRICS === 'true' && (!process.env.METRICS_TOKEN || process.env.METRICS_TOKEN.length < 32)) throw new Error('METRICS_TOKEN must be at least 32 characters when metrics are enabled');
for (const file of ['database/001_core_schema.sql','database/migrations/002_production_security.sql','app/index.html']) if (!fs.existsSync(file)) throw new Error(`Missing required artifact: ${file}`);
console.log(JSON.stringify({ ok:true, configurations:Object.keys(configurations).length, environment:process.env.NODE_ENV||'development' }));
