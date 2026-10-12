import { json, preflight } from "../../server/lib/http.js";

export const onRequestOptions = () => preflight();

// Le site appelle cette adresse pour savoir si l'API existe (elle n'existe pas sur GitHub Pages ni en local).
export const onRequestGet = ({ env }) => json({ ok: true, db: !!env.DB });
