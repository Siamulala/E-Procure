# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Backend Setup

This project includes a Node/Express backend in `backend/`.

1. Install backend dependencies:
   - `cd backend`
   - `npm install`
2. Start MongoDB locally or configure Atlas:
   - Local MongoDB: run the `mongod` service and ensure it listens on `127.0.0.1:27017`
   - Atlas: set `MONGODB_URI` before starting the backend
3. Start the backend server:
   - `npm start`
4. Check health:
   - `http://localhost:5000/health`

If MongoDB is not available, the backend will still start in offline mode.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

## Alwen system migration

The existing React/Express app is being migrated in phases. Phase 1 adds the SQLAlchemy schema, Alembic setup, reference seeds, and Excel import staging under [`api/`](./api/). Phase 2 adds authenticated purchase-request approval/conversion, purchase-order receiving, weighted-average stock balances, and the stock ledger. Phase 3 adds filtered analytics, quote/price comparisons, stock alerts, and CSV export for purchase-order commitments. See [the API README](./api/README.md) for setup, account creation, and workflow usage.

The Alwen React workspace connects to the FastAPI service when `REACT_APP_ALWEN_API_URL` is set; otherwise the legacy browser-local app remains available. The uploaded workbook is available, but workbook-specific importer reconciliation remains deferred.

## Browser-local spreadsheet import

On Inventory Stock, use **Actions > Upload spreadsheet** to review purchased Stock In from an Excel or CSV file. Choose the worksheet, header row, and column mappings; correct the values and exclude unwanted rows before recording. Item names/SKUs and supplier names are matched case-insensitively to existing records or created automatically. New items use the imported name or SKU for both fields, the first receipt's UOM and unit cost, and a zero reorder level; new suppliers have no contact or payment details until edited. Duplicate existing names or archived items require correction before import. Receipt dates must be `YYYY-MM-DD`. Recording adjusts stock and includes purchased receipts in dashboard analysis; importing the same file again creates duplicate receipts.

Every reviewed Stock In row needs an item, quantity, UOM, receipt date, supplier and unit cost. If a row cannot be recorded, its error appears beside the recording button; correct it and try again. No rows are saved until the whole batch is valid.

Units such as pcs, rolls, reels, pairs and packets are normalized. When a receipt uses a unit without a known conversion, confirm it to keep a separate balance instead of treating it as the item's main unit. In **Actions > Configure cable length** on Inventory Stock, Stock In or Stock Out, choose the item and cable type: ADSS defaults to 4,000 m per roll and drop cable to 2,000 m per reel. Confirm or change the length before saving. Stock Out can then issue metres or kilometres and shows the remaining package and length balance. A length already used for converted movements cannot be changed without reconciling its history. Stock value and reorder indicators cover the main unit only, not separate balances.

On the browser-local Inventory Stock report, select one receipt and choose **Actions > Edit**, or select one or more receipts and choose **Delete**. These actions require Stock In access, adjust the stock balance and purchase analytics, and cannot make stock negative. Purchase-order receipts cannot be changed independently of their order.

Use **Actions > Manage categories** on Inventory Stock to add a category, rename a category across inventory items and history, or assign a category to one selected receipt. Category-only changes are also available for purchase-order receipts and do not change their quantities or values.

In the browser-local Purchase Orders page, choose a supplier in the register to see its orders and item lines, including received orders; choose **All suppliers** to see every order. The register CSV export follows this filter. In the create form, choose a supplier and use **Add another item** to create an order with multiple lines. To issue some lines from a pending order separately, choose **Select items**, select the lines and create a new PO. The selected lines move to a new PO number for the same supplier; the remaining lines stay on the original. Quotation references are retained on both orders. Previously shared copies of the original will no longer match; orders linked to supplier invoices cannot be split. Select the new order and use **Documents** to print or download it.

Procurement can select one PO in the register and choose **Actions > Edit**, including for received and quotation-linked orders. Choosing Edit for the current PO returns to its form; switching to another PO requires confirmation before discarding unsaved changes. For received orders, saving reconciles linked receipts and stock; changes that would make stock negative, or orders with missing or ambiguous receipt history, must be reconciled separately. Linked invoice numbers, dates and totals can be edited with the PO; payments remain unchanged and invoice totals cannot be reduced below payments already recorded. Changing supplier updates linked invoices and removes the quotation link. Status remains visible in the register but is omitted from printed and exported PO documents.

**Actions > Delete** confirms before deleting selected POs, their linked supplier invoices and payment history, and quotations not used by another PO. Received stock and receipt history are reversed; deletion is blocked if receipts are missing or ambiguous, or the reversal would make stock negative. Shared quotations remain in place.

Requesters can use the same action on Purchase Requests to load spreadsheet lines into one editable request. Quantities are converted to the item's stock unit when units are compatible; the request is not submitted until the user submits the form.

Spreadsheets are processed locally using header matching, not AI or OCR. PDF and image extraction and spreadsheet import in the API-backed workspace are not supported by this workflow.
