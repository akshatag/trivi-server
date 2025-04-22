"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
require("./config");
const db_1 = require("./utils/db");
const challenges_1 = __importDefault(require("./routes/challenges"));
const users_1 = __importDefault(require("./routes/users"));
const pods_1 = __importDefault(require("./routes/pods"));
const teams_1 = __importDefault(require("./routes/teams"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: ['https://trivi.codeium.com', 'http://localhost:3000', 'https://trivi-client.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
app.use('/challenges', challenges_1.default);
app.use('/users', users_1.default);
app.use('/pods', pods_1.default);
app.use('/teams', teams_1.default);
app.use('/analytics', analytics_1.default);
app.get('/', (req, res) => {
    res.send('API is running!');
});
app.post('/', (req, res) => {
    res.status(201).json({ message: 'Question set successfully!' });
});
process.on('SIGINT', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Closing PostgreSQL pool...');
    yield db_1.pgpool.end();
    console.log('PostgreSQL pool closed.');
    process.exit(0);
}));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
