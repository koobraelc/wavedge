import "dotenv/config";
import { app } from "./app.js";

const port = parseInt(process.env.PORT ?? "3000", 10);

app.listen(port, () => {
  console.log(`Wavedge running on http://localhost:${port}`);
});
