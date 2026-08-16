const { PrismaClient } = require('@prisma/client');

// Single shared instance — avoids exhausting DB connections under
// nodemon/--watch reloads in dev.
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
