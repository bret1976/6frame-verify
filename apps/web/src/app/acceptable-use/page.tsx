import { Nav } from "@/components/Nav";

export default function Page() {
  return (
    <div className="wrap">
      <Nav />
      <h1>Acceptable Use</h1>
      <p className="lede">
        6Frame Verify is operated by 6Frame Studio. Buyers are software agents acting under
        payment authority granted by their organizations. The service performs read-only
        verification of publicly reachable HTTPS URLs and declared assets. It does not publish,
        deploy, email, spend, or submit real forms on buyer property. Evidence is retained per
        published retention defaults. Contact: security@6framestudio.com.
      </p>
      <div className="footer">© 6Frame Studio</div>
    </div>
  );
}
