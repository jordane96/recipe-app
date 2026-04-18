import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ADD_TO_PLAN_QUERY,
  readFromHistory,
  readFromShopping,
  readPlanPhaseSide,
  readSidesListTab,
  recipeDetailPath,
  urlParamToPlanKey,
} from "./listTabSearch";

export function EditRecipePlaceholderPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromSidesList = readSidesListTab(searchParams);
  const fromShopping = readFromShopping(searchParams);
  const fromHistory = readFromHistory(searchParams);
  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;
  const listSidesTab = inPlanFlow ? readPlanPhaseSide(searchParams) : fromSidesList;
  const preserve = inPlanFlow || fromShopping || fromHistory ? searchParams : undefined;

  const backTo =
    id != null && id !== ""
      ? recipeDetailPath(id, listSidesTab, preserve)
      : "/recipes";

  return (
    <div className="recipe-list-page">
      <div className="top-bar">
        <Link to={backTo} className="back-btn">
          Back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Edit recipe
        </h1>
      </div>
      <p className="recipe-experience-tbd-msg">Edit recipe experience TBD</p>
    </div>
  );
}
