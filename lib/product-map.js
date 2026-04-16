const PRODUCT_MAP = {
    "קרן פנסיה": "a57cb043-6372-4cc3-b64c-3d8f7fe29525",
    "פנסיה מקיפה": "0a274461-86ae-44a3-83de-5dbb5d5200e8",
    "פנסיה משלימה": "039d3285-016f-4596-916a-8d334ffca351",
    "קרן השתלמות": "eb326311-1e7b-4968-86ff-ba397db62291",
    "קופת גמל": "0e4e450c-5ec9-45c9-95af-f8f5fd1d93e4",
    "גמל להשקעה": "89cb9b71-7566-4939-993c-0a9a1997eeb1",
    "ביטוח מנהלים": "abe0b9ae-ce7a-4952-93d2-4fc4697266de",
    "ביטוח חיים": "1043402e-0f6e-4654-86c4-c61cd4d565b1",
    "סיכון טהור": "e643840a-592f-481f-bcf5-6885b3610ee8",
    "חיסכון פיננסי": "bfaca8aa-81cb-45d9-a01f-87868531315f",
    "תיקון 190": "8f9e3be8-17a7-4cbb-ac30-4d27263b9b7e",
};

const ID_TO_NAME = Object.fromEntries(
    Object.entries(PRODUCT_MAP).map(([name, id]) => [id, name])
);

function getProductName(productId) {
    return ID_TO_NAME[productId] || "";
}

module.exports = { PRODUCT_MAP, getProductName };
