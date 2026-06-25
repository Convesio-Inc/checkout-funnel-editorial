import { BrowserRouter, Route, Routes } from "react-router";

import { CheckoutPage } from "@/pages/CheckoutPage";
import { ThankYouPage } from "@/pages/ThankYouPage";
import { ShopLayout } from "./layouts/ShopLayout";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ShopLayout />}>
          <Route index element={<CheckoutPage />} />
          <Route path="thank-you" element={<ThankYouPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
