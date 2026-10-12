// Worker : l'API sur /api/*, tout le reste est servi par les fichiers statiques (docs/).
import { handleApi } from "./api.js";

export default {
  async fetch(request, env) {
    const api = await handleApi(request, env);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },
};
