const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
const middleware = (_req, _res, next) => storage.run({ actor: null }, next);
function setActor(actor) { const value = storage.getStore(); if (value) value.actor = actor; }
const getActor = () => storage.getStore()?.actor || null;
module.exports = { middleware, setActor, getActor };
