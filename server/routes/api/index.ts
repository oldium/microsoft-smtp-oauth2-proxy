import express from "express";
import cors from "cors";
import { corsOptions } from "../../lib/cors";
import userHandler from "./user_route";
import resetHandler from "./reset_route";

export default function router() {
    const router = express.Router({ strict: true });

    // AJAX request
    router.options("/api/reset", cors(corsOptions(["POST"], true)));
    router.post("/api/reset", cors(corsOptions(["POST"], true)));
    router.post("/api/reset", resetHandler);

    // AJAX request
    router.options("/api/user", cors(corsOptions(["GET"], true)));
    router.get("/api/user", cors(corsOptions(["GET"], true)));
    router.get("/api/user", userHandler);

    router.use(/^\/api\/.*$/, async (_req, res) => {
        res.status(404).json({ message: "Not Found" });
    });

    return router;
}
