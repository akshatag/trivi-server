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
const db_1 = require("../utils/db");
const router = express_1.default.Router();
// recommit
// Get response rates for all users in the team over the last 30 days
router.get('/response-rates/users', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.pgpool.query(`
      WITH user_stats AS (
        SELECT 
          p.id as user_id,
          p.email,
          COUNT(DISTINCT c.id) as total_challenges,
          COUNT(DISTINCT r.id) as total_responses
        FROM 
          profiles p
          LEFT JOIN challenges c ON c.team_id = p.team_id 
            AND c.challenge_date >= NOW() - INTERVAL '30 days'
            AND c.challenge_date <= NOW()
          LEFT JOIN responses r ON r.user_id = p.id 
            AND r.challenge_id = c.id
        WHERE 
          p.role = 'POD_MEMBER'
        GROUP BY 
          p.id, p.email
      )
      SELECT 
        user_id,
        email,
        total_challenges,
        total_responses,
        CASE 
          WHEN total_challenges = 0 THEN 0
          ELSE ROUND((total_responses::decimal / total_challenges::decimal) * 100, 2)
        END as response_rate
      FROM 
        user_stats
      ORDER BY 
        response_rate DESC;
    `);
        res.json(data.rows);
    }
    catch (error) {
        console.error('Error getting user response rates:', error);
        res.status(500).json({ message: error });
    }
}));
// Get response rates by pod over the last 30 days
router.get('/response-rates/pods', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.pgpool.query(`
      WITH pod_stats AS (
        SELECT 
          pod.id as pod_id,
          pod.name as pod_name,
          COUNT(c.id) as total_challenges,
          COUNT(DISTINCT r.id) as total_responses
        FROM 
          pods pod
          LEFT JOIN profiles p ON p.pod_id = pod.id 
            AND p.role = 'POD_MEMBER'
          LEFT JOIN challenges c ON c.team_id = pod.team_id 
            AND c.challenge_date >= NOW() - INTERVAL '30 days'
            AND c.challenge_date <= NOW()
          LEFT JOIN responses r ON r.user_id = p.id 
            AND r.challenge_id = c.id
        GROUP BY 
          pod.id, pod.name
      )
      SELECT 
        pod_id,
        pod_name,
        total_challenges,
        total_responses,
        CASE 
          WHEN total_challenges = 0 THEN 0
          ELSE ROUND((total_responses::decimal / total_challenges::decimal) * 100, 2)
        END as response_rate
      FROM 
        pod_stats
      ORDER BY 
        response_rate DESC;
    `);
        res.json(data.rows);
    }
    catch (error) {
        console.error('Error getting pod response rates:', error);
        res.status(500).json({ message: error });
    }
}));
exports.default = router;
