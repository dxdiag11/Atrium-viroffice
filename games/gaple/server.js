const express = require('express');
const path = require('path');
const { createServer, announce } = require('../serve');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3200;
const server = createServer(app);
server.listen(PORT, '0.0.0.0', () => announce('🎴 Gaple    ', server, PORT));
