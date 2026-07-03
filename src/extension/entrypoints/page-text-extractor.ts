import { extractPageText } from "../lib/page-text/extract-page-text";

export default defineUnlistedScript(() => {
  return extractPageText(document);
});
