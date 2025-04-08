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
const supabase_1 = require("../utils/supabase");
const router = express_1.default.Router();
// Check if the domain the user is trying to join with exists
router.get('/:domain', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const domain = req.params.domain.trim();
    console.log('Checking domain:', domain);
    const { data, error } = yield supabase_1.supabase
        .from('teams')
        .select('*')
        .filter('domain', 'ilike', `%${domain}%`);
    if (data) {
        res.status(200).json(data);
        return;
    }
    else {
        res.status(200).json(null);
        return;
    }
}));
exports.default = router;
