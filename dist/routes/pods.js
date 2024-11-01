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
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../utils/supabase");
const db_1 = require("../utils/db");
const router = express_1.default.Router();
// Get list of all pods in the user's team
router.get('/all', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.pgpool.query(`
        SELECT 
          *
        FROM
          pods
        WHERE
          pods.team_id = $1
    `, [req.user.team_id]);
        res.json(data.rows);
        return;
    }
    catch (error) {
        console.error('Error getting pods:', error);
        res.status(500).json({ message: error });
        return;
    }
}));
// Update a pod
router.post('/', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.user.role != 'TEAM_ADMIN') {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    const { data, error } = yield supabase_1.supabase
        .from('pods')
        .update({ name: req.body.pod_name })
        .eq('team_id', req.user.team_id)
        .eq('id', req.body.pod_id);
    if (error) {
        console.error('Error updating pod:', error);
        res.status(500).json({ message: error.message });
        return;
    }
    res.status(201).json({ message: 'Pod updated successfully!' });
    return;
}));
exports.default = router;
