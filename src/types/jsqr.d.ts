declare module "jsqr" {
  interface JsQrResult {
    data: string;
  }

  function jsQR(data: Uint8ClampedArray, width: number, height: number): JsQrResult | null;
  export default jsQR;
}
