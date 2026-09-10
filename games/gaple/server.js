const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3200;
app.listen(PORT, () => {
  console.log(`\n🎴 Game Gaple berjalan di: http://localhost:${PORT}\n`);
});
