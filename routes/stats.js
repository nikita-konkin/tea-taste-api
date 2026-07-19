const privateRouter = require('express').Router();

const { getMyTopDescriptors } = require('../controllers/stats');

privateRouter.get('/my-descriptors', getMyTopDescriptors);

module.exports.privateRouter = privateRouter;
