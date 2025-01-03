import express from "express";
import authHandler from "./auth_handler";
import cancelHandler from "./cancel_handler";
import logoutHandler from "./logout_handler";
import cors from "cors";
import { corsOptions } from "../../lib/cors";
import nocache from "nocache";

export default function router() {
    const router = express.Router({ strict: true });

    // Browser request, no CORS
    router.get("/auth", nocache(), authHandler);

    // AJAX requests
    router.options(["/auth/cancel", "/auth/logout"], cors(corsOptions(["POST"], true)));
    router.post(["/auth/cancel", "/auth/logout"], cors(corsOptions(["POST"], true)));
    router.post("/auth/cancel", cancelHandler);
    router.post("/auth/logout", logoutHandler);

    router.use(/^\/auth\/.*$/, async (_req, res) => {
        res.status(404).json({ message: "Not Found" });
    });

    return router;
}
